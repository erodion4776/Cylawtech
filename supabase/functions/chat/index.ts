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
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMBEDDING_DIM = 384;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message: string, status = 500, details?: any) {
  return json({ error: message, details }, status);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeJurisdiction(value: unknown): string {
  const v = cleanString(value, "nigeria").toLowerCase();
  const map: Record<string, string> = {
    ng: "nigeria", nigeria: "nigeria", "nigerian law": "nigeria",
    us: "us", usa: "us", "united states": "us",
    uk: "uk", "united kingdom": "uk", global: "global",
  };
  return map[v] || v;
}

function extractSectionReferences(query: string): string[] {
  const sections = new Set<string>();
  const regex = /\b(?:sections?|sec\.|s\.|articles?|art\.)\s*(\d+[A-Za-z]*)\b/gi;
  let match;
  while ((match = regex.exec(query)) !== null) {
    sections.add(match[1].toUpperCase());
  }
  return Array.from(sections);
}

async function createQueryEmbedding(query: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const cleaned = query.substring(0, 1000).replace(/\n/g, " ");
  const result = await model.run(cleaned, { mean_pool: true, normalize: true });
  return Array.from(result as Float32Array).map(Number);
}

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
  if (chunk.url_template && sec) {
    return chunk.url_template.replace("{section}", sec).replace("{subsection}", chunk.subsection || "");
  }
  if (chunk.source_url) {
    const base = chunk.source_url.replace(/#.*$/, "");
    return sec ? `${base}#section-${sec}` : base;
  }
  return null;
}

async function retrieveStatutoryContext(
  query: string,
  jurisdiction: string
): Promise<RetrievedChunk[]> {
  const targetSections = extractSectionReferences(query);
  const results: RetrievedChunk[] = [];
  const seenIds = new Set<string>();

  // 1. PINPOINT SECTION RETRIEVAL
  if (targetSections.length > 0) {
    let sectionQuery = supabase
      .from("knowledge_chunks")
      .select(`
        id, document_id, content, section_number, subsection, source_locator,
        documents!inner (
          title, jurisdiction, authority_level, current_status, source_url, url_template, status
        )
      `)
      .in("section_number", targetSections)
      .eq("documents.status", "completed");

    if (jurisdiction !== "global") {
      sectionQuery = sectionQuery.eq("documents.jurisdiction", jurisdiction);
    }

    const { data: sectionMatches } = await sectionQuery.order("id", { ascending: true }).limit(6);

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

  // 2. VECTOR SEARCH (Semantic Fallback)
  try {
    const queryVector = await createQueryEmbedding(query);
    const { data: vectorMatches } = await supabase.rpc("match_legal_chunks", {
      query_embedding: queryVector,
      match_threshold: 0.25,
      match_count: 6,
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
    console.warn("Vector search fallback:", e);
  }

  return results.slice(0, 6);
}

function buildLegalSystemPrompt(jurisdiction: string): string {
  return `You are LexAI, an elite statutory intelligence assistant for ${jurisdiction.toUpperCase()} law.

RULES:
1. STRICT GROUNDING: Explain the legal position based on the provided STATUTORY CONTEXT. Do not fabricate sections or rules.
2. WHEN SECTION 84 IS QUERIED: Detail Subsection (1) admissibility, (2)(a)-(d) operating conditions, and (4) certificate requirements.
3. CONCISE & COMPLETE: Present clear, authoritative legal analysis.`;
}

function formatContextPayload(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No indexed statutory provisions found.";
  return chunks
    .map((c, i) => {
      const link = buildCitationUrl(c);
      return `--- AUTHORITY RECORD [${i + 1}] ---
DOCUMENT: ${c.document_title || "Statute"} (${c.jurisdiction || "Nigeria"})
SECTION: ${c.section_number || "General"} | SUBSECTION: ${c.subsection || "All"}
STATUS: ${c.current_status || "Verified"}
ONLINE CITATION: ${link || "Not available"}
TEXT:
${c.content.substring(0, 1000)}
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
  const rawGroqKey = Deno.env.get("GROQ_API_KEY") || "";
  const rawOpenAiKey = Deno.env.get("OPENAI_API_KEY") || "";

  const groqKey = rawGroqKey.trim().replace(/^["']|["']$/g, "");
  const openAiKey = rawOpenAiKey.trim().replace(/^["']|["']$/g, "");

  if (!groqKey && !openAiKey) {
    throw new Error("Missing GROQ_API_KEY in Supabase Edge Functions secrets.");
  }

  // Sanitize history so only pure role & content strings are forwarded
  const sanitizedHistory = (history || [])
    .filter(
      (m: any) =>
        m &&
        typeof m === "object" &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        (m.role === "user" || m.role === "assistant")
    )
    .slice(-3)
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).trim(),
    }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...sanitizedHistory,
    {
      role: "user",
      content: `STATUTORY CONTEXT:\n${contextPayload}\n\nUSER QUESTION:\n${userQuery}`,
    },
  ];

  const errors: string[] = [];

  // 1. Try Groq Active Production Models
  if (groqKey) {
    const modelsToTry = [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "gemma2-9b-it"
    ];

    for (const model of modelsToTry) {
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_tokens: 1500,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) return reply;
        }

        const errText = await resp.text();
        const errDesc = `[Groq ${model} (${resp.status})]: ${errText}`;
        console.error(errDesc);
        errors.push(errDesc);
      } catch (err: any) {
        const errDesc = `[Groq ${model} error]: ${err.message}`;
        console.error(errDesc);
        errors.push(errDesc);
      }
    }
  }

  // 2. Try OpenAI Fallback
  if (openAiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.1,
          max_tokens: 1500,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content;
        if (reply) return reply;
      }

      const errText = await resp.text();
      errors.push(`[OpenAI (${resp.status})]: ${errText}`);
    } catch (e: any) {
      errors.push(`[OpenAI error]: ${e.message}`);
    }
  }

  throw new Error(`LLM Generation Failed across all models:\n${errors.join("\n")}`);
}

// ============================================================
// MAIN DISPATCHER
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

    const retrievedChunks = await retrieveStatutoryContext(query, jurisdiction);
    const systemPrompt = buildLegalSystemPrompt(jurisdiction);
    const contextPayload = formatContextPayload(retrievedChunks);

    const answer = await generateLegalAnswer(systemPrompt, query, contextPayload, history);

    const citations = retrievedChunks.map((c) => ({
      text: c.section_number ? `Section ${c.section_number} — ${c.document_title || "Statute"}` : c.source_locator,
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
  } catch (error: any) {
    console.error("Chat Pipeline Error:", error);
    return errorResponse(error?.message || "Chat service error", 500);
  }
});
