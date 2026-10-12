import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-id, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const EMBEDDING_DIM = 384;

// ============================================================
// HELPERS
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function errorResponse(
  message: string,
  status = 500,
  extra: Record<string, unknown> = {}
) {
  return json({ error: message, ...extra }, status);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeJurisdiction(value: unknown): string {
  const v = cleanString(value, "nigeria").toLowerCase();
  const map: Record<string, string> = {
    ng: "nigeria",
    nigeria: "nigeria",
    "nigerian law": "nigeria",
    us: "us",
    usa: "us",
    "united states": "us",
    uk: "uk",
    "united kingdom": "uk",
    global: "global",
  };
  return map[v] || v;
}

// ============================================================
// STATUTORY QUERY DETECTION
// ============================================================

function extractSectionReferences(query: string): string[] {
  const sections = new Set<string>();
  const regex = /\b(?:sections?|sec\.|s\.|articles?|art\.)\s*(\d+[A-Za-z]*)\b/gi;
  let match;
  while ((match = regex.exec(query)) !== null) {
    sections.add(match[1].toUpperCase());
  }
  return Array.from(sections);
}

// ============================================================
// EMBEDDING INFERENCE (gte-small 384-DIM)
// ============================================================

async function createQueryEmbedding(query: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const cleaned = query.substring(0, 1000).replace(/\n/g, " ");

  const result = await model.run(cleaned, {
    mean_pool: true,
    normalize: true,
  });

  const embedding = Array.from(result as Float32Array).map(Number);
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Query embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
    );
  }
  return embedding;
}

// ============================================================
// CITATION URL BUILDER
// ============================================================

interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
  similarity: number;
  document_title?: string;
  jurisdiction?: string;
  authority_level?: string;
  current_status?: string;
  source_url?: string | null;
  url_template?: string | null;
}

function buildCitationUrl(chunk: RetrievedChunk): string | null {
  const sec = chunk.section_number;

  // 1. Dynamic template interpolation (e.g. https://law.org/act#section-{section})
  if (chunk.url_template) {
    let url = chunk.url_template;
    if (sec) {
      url = url.replace("{section}", sec);
      url = url.replace("{subsection}", chunk.subsection || "");
    } else {
      url = url.replace("{section}", "").replace("{subsection}", "");
    }
    return url;
  }

  // 2. Base Source URL with anchor fallback
  if (chunk.source_url) {
    const base = chunk.source_url.replace(/#.*$/, "");
    if (sec) {
      return `${base}#section-${sec}`;
    }
    return base;
  }

  return null;
}

// ============================================================
// STATUTORY RETRIEVAL ENGINE
// ============================================================

async function retrieveStatutoryContext(
  query: string,
  jurisdiction: string
): Promise<RetrievedChunk[]> {
  const targetSections = extractSectionReferences(query);
  const results: RetrievedChunk[] = [];
  const seenIds = new Set<string>();

  // 1. PINPOINT SECTION RETRIEVAL (Pulls entire section for ss. 83, 84, 180, etc.)
  if (targetSections.length > 0) {
    let sectionQuery = supabase
      .from("knowledge_chunks")
      .select(
        `
        id,
        document_id,
        content,
        section_number,
        subsection,
        source_locator,
        documents!inner (
          title,
          jurisdiction,
          authority_level,
          current_status,
          source_url,
          url_template,
          status
        )
      `
      )
      .in("section_number", targetSections)
      .eq("documents.status", "completed");

    if (jurisdiction !== "global") {
      sectionQuery = sectionQuery.eq("documents.jurisdiction", jurisdiction);
    }

    const { data: sectionMatches } = await sectionQuery.order("id", { ascending: true });

    if (sectionMatches) {
      for (const item of sectionMatches) {
        seenIds.add(item.id);
        const doc = Array.isArray(item.documents) ? item.documents[0] : item.documents;
        results.push({
          id: item.id,
          document_id: item.document_id,
          content: item.content,
          section_number: item.section_number,
          subsection: item.subsection,
          source_locator: item.source_locator,
          similarity: 1.0,
          document_title: doc?.title,
          jurisdiction: doc?.jurisdiction,
          authority_level: doc?.authority_level,
          current_status: doc?.current_status,
          source_url: doc?.source_url,
          url_template: doc?.url_template,
        });
      }
    }
  }

  // 2. GENERAL ACT INQUIRY RESOLVER (Handles "What is the Evidence Act?", etc.)
  const isGeneralActQuery =
    targetSections.length === 0 &&
    (query.toLowerCase().includes("act") ||
      query.toLowerCase().includes("law") ||
      query.toLowerCase().includes("statute") ||
      query.toLowerCase().includes("constitution"));

  if (isGeneralActQuery) {
    let introQuery = supabase
      .from("knowledge_chunks")
      .select(
        `
        id,
        document_id,
        content,
        section_number,
        subsection,
        source_locator,
        documents!inner (
          title,
          jurisdiction,
          authority_level,
          current_status,
          source_url,
          url_template,
          status
        )
      `
      )
      .or("section_number.in.(1,2,3),section_number.is.null")
      .eq("documents.status", "completed")
      .limit(4);

    if (jurisdiction !== "global") {
      introQuery = introQuery.eq("documents.jurisdiction", jurisdiction);
    }

    const { data: introMatches } = await introQuery;
    if (introMatches) {
      for (const item of introMatches) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          const doc = Array.isArray(item.documents) ? item.documents[0] : item.documents;
          results.push({
            id: item.id,
            document_id: item.document_id,
            content: item.content,
            section_number: item.section_number,
            subsection: item.subsection,
            source_locator: item.source_locator,
            similarity: 0.95,
            document_title: doc?.title,
            jurisdiction: doc?.jurisdiction,
            authority_level: doc?.authority_level,
            current_status: doc?.current_status,
            source_url: doc?.source_url,
            url_template: doc?.url_template,
          });
        }
      }
    }
  }

  // 3. VECTOR SEMANTIC SIMILARITY SEARCH
  try {
    const queryVector = await createQueryEmbedding(query);
    const { data: vectorMatches } = await supabase.rpc("match_legal_chunks", {
      query_embedding: queryVector,
      match_threshold: 0.25,
      match_count: 10,
      filter_jurisdiction: jurisdiction === "global" ? null : jurisdiction,
    });

    if (Array.isArray(vectorMatches)) {
      for (const item of vectorMatches) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push({
            id: item.id,
            document_id: item.document_id,
            content: item.content,
            section_number: item.section_number,
            subsection: item.subsection,
            source_locator: item.source_locator,
            similarity: item.similarity ?? 0.75,
            document_title: item.title,
            jurisdiction: item.jurisdiction,
            authority_level: item.authority_level,
            current_status: item.current_status,
            source_url: item.source_url,
            url_template: item.url_template,
          });
        }
      }
    }
  } catch (e) {
    console.warn("Vector RPC search fallback:", e);
  }

  // 4. FULL-TEXT KEYWORD FALLBACK (Ensures results even if semantic similarity is low)
  if (results.length < 2) {
    const keywords = query
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(" & ");

    if (keywords) {
      const { data: textMatches } = await supabase
        .from("knowledge_chunks")
        .select(
          `
          id,
          document_id,
          content,
          section_number,
          subsection,
          source_locator,
          documents!inner (
            title,
            jurisdiction,
            authority_level,
            current_status,
            source_url,
            url_template,
            status
          )
        `
        )
        .textSearch("content", keywords, { type: "websearch" })
        .limit(4);

      if (textMatches) {
        for (const item of textMatches) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            const doc = Array.isArray(item.documents) ? item.documents[0] : item.documents;
            results.push({
              id: item.id,
              document_id: item.document_id,
              content: item.content,
              section_number: item.section_number,
              subsection: item.subsection,
              source_locator: item.source_locator,
              similarity: 0.65,
              document_title: doc?.title,
              jurisdiction: doc?.jurisdiction,
              authority_level: doc?.authority_level,
              current_status: doc?.current_status,
              source_url: doc?.source_url,
              url_template: doc?.url_template,
            });
          }
        }
      }
    }
  }

  return results.slice(0, 12);
}

// ============================================================
// LEGAL REASONING ENGINE (LLM INFERENCE)
// ============================================================

function buildLegalSystemPrompt(jurisdiction: string): string {
  return `You are LexAI, an authoritative statutory intelligence assistant specializing in ${jurisdiction.toUpperCase()} law.

OPERATIONAL PRINCIPLES:
1. STRICT GROUNDING: Base your answer directly upon the provided STATUTORY CONTEXT. Do not fabricate sections, provisions, or citations.
2. EVIDENCE ACT SPECIFICITY:
   - When Section 84 of the Evidence Act is queried, detail all subsections: (1) general admissibility, (2)(a)-(d) the four mandatory operating conditions, (3) devices in combination, and (4)(a)-(c) certificate requirements.
   - When Section 83 is queried, explain general documentary hearsay rules and conditions for maker statements.
   - When Section 180 is queried, explain the competence and compellability of witnesses.
3. CLEAR STRUCTURE:
   - Direct Answer
   - Applicable Law (Exact Statute & Sections)
   - Substantive Analysis (Detailed bullet points)
   - Procedural Conditions / Exceptions
   - Verification Status
4. PREVENT TRUNCATION: Provide a complete, fully articulated response. Never end mid-sentence.`;
}

function formatContextPayload(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No indexed statutory provisions found.";
  return chunks
    .map((c, i) => {
      const link = buildCitationUrl(c);
      return `--- AUTHORITY RECORD [${i + 1}] ---
DOCUMENT: ${c.document_title || "Statute"} (${c.jurisdiction || "Nigeria"})
SECTION: ${c.section_number || "Overview / Preamble"} | SUBSECTION: ${c.subsection || "All"}
STATUS: ${c.current_status || "Verified"}
ONLINE CITATION LINK: ${link || "Not available"}
LOCATOR: ${c.source_locator}
STATUTORY TEXT:
${c.content}
------------------------------------`;
    })
    .join("\n\n");
}

async function generateLegalAnswer(
  systemPrompt: string,
  userQuery: string,
  contextPayload: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-4),
    {
      role: "user",
      content: `STATUTORY CONTEXT:\n${contextPayload}\n\nUSER INQUIRY:\n${userQuery}`,
    },
  ];

  // 1. Primary Engine: Groq Llama-3.3-70b
  if (groqKey) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: 0.1,
          max_tokens: 3500,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.choices[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("Groq inference error:", e);
    }
  }

  // 2. Fallback Engine: OpenAI GPT-4o
  if (openAiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          temperature: 0.1,
          max_tokens: 3500,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.choices[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("OpenAI inference error:", e);
    }
  }

  throw new Error("No operational LLM API keys (GROQ_API_KEY or OPENAI_API_KEY) found.");
}

// ============================================================
// MAIN HTTP DISPATCHER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || (!body.message && !body.query)) {
      return errorResponse("Legal query message is required.", 400);
    }

    const query = cleanString(body.message || body.query);
    const jurisdiction = normalizeJurisdiction(body.jurisdiction || body.site);
    const history = Array.isArray(body.history) ? body.history : [];

    // 1. Retrieve statutory authorities
    const retrievedChunks = await retrieveStatutoryContext(query, jurisdiction);

    // 2. Build system directives & statutory context payload
    const systemPrompt = buildLegalSystemPrompt(jurisdiction);
    const contextPayload = formatContextPayload(retrievedChunks);

    // 3. Generate response with LLM
    const answer = await generateLegalAnswer(
      systemPrompt,
      query,
      contextPayload,
      history
    );

    // 4. Build structured citations array for frontend UI
    const citations = retrievedChunks.map((c) => ({
      text: c.section_number
        ? `Section ${c.section_number}${c.subsection || ""} — ${c.document_title || "Statute"}`
        : c.source_locator,
      url: buildCitationUrl(c),
      section: c.section_number ? `Section ${c.section_number}` : null,
      subsection: c.subsection,
      status: c.current_status || "verified",
      similarity: Number((c.similarity || 0).toFixed(3)),
    }));

    return json({
      success: true,
      answer,
      jurisdiction,
      authorities_retrieved: retrievedChunks.length,
      citations,
    });
  } catch (error) {
    console.error("Chat Pipeline Error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal chat pipeline error",
      500
    );
  }
});
