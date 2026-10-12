import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-admin-key",
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
// EMBEDDING (gte-small 384-DIM)
// ============================================================

async function createQueryEmbedding(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const cleaned = text.substring(0, 1000).replace(/\n/g, " ");

  const result = await model.run(cleaned, {
    mean_pool: true,
    normalize: true,
  });

  const embedding = Array.from(result as Float32Array).map(Number);
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
    );
  }
  return embedding;
}

// ============================================================
// STATUTORY RETRIEVAL
// ============================================================

interface AuthorityMatch {
  source_locator: string;
  document_title: string;
  section_number: string | null;
  subsection: string | null;
  content: string;
  current_status: string;
  similarity: number;
}

async function retrieveStatutoryAuthorities(
  query: string,
  jurisdiction: string,
  specificSections: string[] = []
): Promise<AuthorityMatch[]> {
  const queryVector = await createQueryEmbedding(query);
  const results: AuthorityMatch[] = [];
  const seenIds = new Set<string>();

  // 1. Direct section pinpointing (e.g. Sections 83, 84, 180)
  if (specificSections.length > 0) {
    const { data: directMatches } = await supabase
      .from("knowledge_chunks")
      .select(
        `
        id,
        content,
        section_number,
        subsection,
        source_locator,
        documents!inner (
          title,
          jurisdiction,
          current_status,
          status
        )
      `
      )
      .in("section_number", specificSections)
      .eq("documents.status", "completed");

    if (directMatches) {
      for (const item of directMatches) {
        seenIds.add(item.id);
        const doc = Array.isArray(item.documents)
          ? item.documents[0]
          : item.documents;

        if (
          jurisdiction === "global" ||
          !doc?.jurisdiction ||
          doc.jurisdiction.toLowerCase() === jurisdiction.toLowerCase()
        ) {
          results.push({
            source_locator: item.source_locator,
            document_title: doc?.title || "Statute",
            section_number: item.section_number,
            subsection: item.subsection,
            content: item.content,
            current_status: doc?.current_status || "verified",
            similarity: 1.0,
          });
        }
      }
    }
  }

  // 2. Vector search via match_legal_chunks RPC
  try {
    const { data: vectorMatches, error: rpcErr } = await supabase.rpc(
      "match_legal_chunks",
      {
        query_embedding: queryVector,
        match_threshold: 0.35,
        match_count: 8,
        filter_jurisdiction: jurisdiction === "global" ? null : jurisdiction,
      }
    );

    if (!rpcErr && Array.isArray(vectorMatches)) {
      for (const item of vectorMatches) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push({
            source_locator: item.source_locator,
            document_title: item.title,
            section_number: item.section_number,
            subsection: item.subsection,
            content: item.content,
            current_status: item.current_status,
            similarity: item.similarity || 0.8,
          });
        }
      }
    }
  } catch (_e) {
    console.warn("RPC vector search failed; proceeding with section matches.");
  }

  return results;
}

// ============================================================
// LLM LEGAL REASONING ENGINE
// ============================================================

async function callLegalLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

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
          max_tokens: 2500,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.choices[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("Groq generation failed in legal-ai:", e);
    }
  }

  if (openAiKey) {
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
        max_tokens: 2500,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return data.choices[0]?.message?.content || "";
    }
  }

  throw new Error("No active LLM inference API key available (GROQ_API_KEY / OPENAI_API_KEY).");
}

// ============================================================
// SPECIALIZED LEGAL MODES
// ============================================================

// 1. Evidence Act Admissibility Analyzer (Sections 83, 84, 180)
async function handleEvidenceAnalysis(
  facts: string,
  jurisdiction: string
): Promise<string> {
  const authorities = await retrieveStatutoryAuthorities(
    "admissibility of documents computer generated evidence electronic records competence of witnesses",
    jurisdiction,
    ["83", "84", "180"]
  );

  const contextText = authorities
    .map((a) => `[${a.source_locator}]\n${a.content}`)
    .join("\n\n");

  const systemPrompt = `You are a Senior Legal Specialist in Evidence and Statutory Construction in ${jurisdiction.toUpperCase()}.
Analyze the factual scenario strictly using the provided statutory provisions (especially Section 83, Section 84, and Section 180 of the Evidence Act where applicable).

STRUCTURE YOUR OPINION AS FOLLOWS:
1. SUMMARY OF ADMISSIBILITY / COMPETENCE ISSUES
2. STATUTORY CONDITIONS PRECEDENT (cite exact subsections, e.g. s.84(2)(a)-(d) and s.84(4) certificate requirements)
3. APPLICATION TO FACTUAL SCENARIO
4. PROCEDURAL STEPS FOR ADMISSION OR OBJECTION
5. DEFINITIVE CONCLUSION`;

  const userPrompt = `STATUTORY AUTHORITIES:\n${contextText}\n\nFACTUAL SCENARIO / EVIDENCE PROFFERED:\n${facts}`;
  return await callLegalLLM(systemPrompt, userPrompt);
}

// 2. Statutory Compliance & Citation Verification
async function handleStatutoryVerification(
  legalProposition: string,
  jurisdiction: string
): Promise<string> {
  const authorities = await retrieveStatutoryAuthorities(
    legalProposition,
    jurisdiction
  );

  const contextText = authorities
    .map((a) => `[${a.source_locator}]\n${a.content}`)
    .join("\n\n");

  const systemPrompt = `You are the LexAI Citation and Statutory Verification Engine.
Your task is to verify whether the user's legal proposition is accurate under ${jurisdiction.toUpperCase()} law.
Confirm or refute the proposition using ONLY verified statutory sources. Point out any miscited sections or repealed provisions.`;

  const userPrompt = `VERIFIED STATUTORY REPOSITORY:\n${contextText}\n\nLEGAL PROPOSITION TO VERIFY:\n${legalProposition}`;
  return await callLegalLLM(systemPrompt, userPrompt);
}

// ============================================================
// MAIN ROUTER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const adminKey = req.headers.get("x-admin-key");
    const apiKey = req.headers.get("x-api-key");
    const expectedAdminKey = Deno.env.get("ADMIN_KEY");

    // Validate access
    let authorized = false;
    if (expectedAdminKey && adminKey === expectedAdminKey) authorized = true;
    if (authHeader && authHeader.startsWith("Bearer ")) authorized = true;

    if (!authorized && apiKey) {
      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("id, status")
        .eq("key", apiKey)
        .eq("status", "active")
        .maybeSingle();

      if (keyRow) authorized = true;
    }

    if (!authorized) {
      return errorResponse("Unauthorized: Valid API Key, Admin Key, or Token required.", 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse("Invalid JSON payload.", 400);
    }

    const mode = cleanString(body.mode, "opinion");
    const text = cleanString(body.text || body.prompt || body.query);
    const jurisdiction = normalizeJurisdiction(body.jurisdiction || body.site);

    if (!text || text.length < 5) {
      return errorResponse("Legal query or text is required.", 400);
    }

    let analysis = "";
    let detectedSections: string[] = [];

    if (mode === "evidence_analysis" || text.toLowerCase().includes("section 84") || text.toLowerCase().includes("computer")) {
      analysis = await handleEvidenceAnalysis(text, jurisdiction);
      detectedSections = ["83", "84", "180"];
    } else if (mode === "verify_citation") {
      analysis = await handleStatutoryVerification(text, jurisdiction);
    } else {
      // General statutory opinion
      const authorities = await retrieveStatutoryAuthorities(text, jurisdiction);
      const contextText = authorities
        .map((a) => `[${a.source_locator}]\n${a.content}`)
        .join("\n\n");

      const systemPrompt = `You are LexAI, an authoritative Legal Research Engine for ${jurisdiction.toUpperCase()} Law.
Provide a rigorous, structured statutory analysis with exact section citations. Do not cite repealed or external jurisdictions.`;

      analysis = await callLegalLLM(
        systemPrompt,
        `STATUTORY REPOSITORY:\n${contextText}\n\nLEGAL QUESTION:\n${text}`
      );
    }

    return json({
      success: true,
      mode,
      jurisdiction,
      analysis,
      referenced_sections: detectedSections,
    });
  } catch (error) {
    console.error("Legal AI Error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Legal AI Engine Error",
      500
    );
  }
});
