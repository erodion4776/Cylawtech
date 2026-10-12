import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EMBEDDING_DIM = 384;
const MAX_CHUNK_CHARS = 1200;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ============================================================
// HELPERS & NORMALIZATION
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
  const valueString = cleanString(value, "nigeria").toLowerCase();
  const aliases: Record<string, string> = {
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
  return aliases[valueString] || valueString;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ============================================================
// STATUTORY PARSING & CONTEXTUAL ENVELOPING
// ============================================================

const EXPLICIT_SECTION_REGEX =
  /^(?:(?:SECTION|Section|SEC\.|Sec\.|ARTICLE|Article|ART\.|Art\.|RULE|Rule|ORDER|Order|S\.)\s*(\d+[A-Za-z]*)|(\d+[A-Za-z]*)\s*[\.\-—–])(?:\s*[\.\-—–:]|\s+)?(.*)$/i;

const CROSS_REFERENCE_REGEX =
  /^(?:under|pursuant to|in accordance with|within the meaning of|see|vide)\s+(?:section|article|rule)\s+\d+/i;

const SUBSECTION_REGEX =
  /^(?:\((\d+|[a-z]|[ivxlcdm]+)\)|([0-9]+)\.\s+|([a-z])\.\s+)\s*(.*)$/i;

interface LegalChunk {
  content: string;
  raw_text: string;
  section_number: string | null;
  heading: string | null;
  subsection: string | null;
  source_locator: string;
}

function detectSectionStart(line: string) {
  const trimmed = line.trim();
  if (!trimmed || CROSS_REFERENCE_REGEX.test(trimmed)) {
    return { sectionNumber: null, heading: null, isExplicitSectionStart: false };
  }
  const match = trimmed.match(EXPLICIT_SECTION_REGEX);
  if (!match) {
    return { sectionNumber: null, heading: null, isExplicitSectionStart: false };
  }
  const secNum = match[1] || match[2] || null;
  const heading = (match[3] || "").trim();
  return {
    sectionNumber: secNum,
    heading: heading || null,
    isExplicitSectionStart: true,
  };
}

function extractSubsectionIndicator(line: string): string | null {
  const match = line.trim().match(SUBSECTION_REGEX);
  if (match) {
    return `(${match[1] || match[2] || match[3]})`;
  }
  return null;
}

function buildContextualEnvelope(
  docTitle: string,
  jurisdiction: string,
  secNum: string | null,
  heading: string | null,
  subsec: string | null,
  body: string
): string {
  const meta: string[] = [`Document: ${docTitle}`];
  if (jurisdiction) meta.push(`Jurisdiction: ${jurisdiction.toUpperCase()}`);
  if (secNum) {
    let secPart = `Section ${secNum}`;
    if (heading) secPart += ` (${heading})`;
    meta.push(secPart);
  }
  if (subsec) meta.push(`Subsection: ${subsec}`);
  return `[${meta.join(" | ")}]\n${body.trim()}`;
}

function chunkLegalContent(
  title: string,
  content: string,
  jurisdiction: string
): LegalChunk[] {
  const normalized = normalizeWhitespace(content);
  if (!normalized) return [];

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks: LegalChunk[] = [];

  let currentSectionNum: string | null = null;
  let currentHeading: string | null = null;
  let currentSubsection: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentLines.length === 0) return;
    const rawText = currentLines.join("\n").trim();
    if (!rawText) {
      currentLines = [];
      return;
    }

    const chunkIdx = chunks.length;
    const envelope = buildContextualEnvelope(
      title,
      jurisdiction,
      currentSectionNum,
      currentHeading,
      currentSubsection,
      rawText
    );

    let locator = title;
    if (currentSectionNum) {
      locator += `, s.${currentSectionNum}`;
      if (currentSubsection) locator += currentSubsection;
    }
    locator += `, chunk ${chunkIdx + 1}`;

    chunks.push({
      content: envelope,
      raw_text: rawText,
      section_number: currentSectionNum,
      heading: currentHeading,
      subsection: currentSubsection,
      source_locator: locator,
    });

    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const detected = detectSectionStart(line);

    if (detected.isExplicitSectionStart) {
      flush();
      currentSectionNum = detected.sectionNumber;
      currentHeading = detected.heading;
      currentSubsection = null;

      if (!currentHeading && i + 1 < lines.length && !detectSectionStart(lines[i + 1]).isExplicitSectionStart) {
        currentHeading = lines[i + 1];
        currentLines.push(line);
        currentLines.push(lines[i + 1]);
        i++;
        continue;
      }
      currentLines.push(line);
      continue;
    }

    const detectedSub = extractSubsectionIndicator(line);
    if (detectedSub) {
      const curLen = currentLines.join("\n").length;
      if (curLen + line.length > MAX_CHUNK_CHARS) flush();
      currentSubsection = detectedSub;
      currentLines.push(line);
      continue;
    }

    const proposedLen = currentLines.join("\n").length + line.length;
    if (currentLines.length > 0 && proposedLen > MAX_CHUNK_CHARS) {
      flush();
    }
    currentLines.push(line);
  }

  flush();

  if (chunks.length === 0) {
    const envelope = buildContextualEnvelope(title, jurisdiction, null, null, null, normalized);
    return [
      {
        content: envelope,
        raw_text: normalized,
        section_number: null,
        heading: null,
        subsection: null,
        source_locator: `${title}, chunk 1`,
      },
    ];
  }

  return chunks;
}

// ============================================================
// EMBEDDING INFERENCE (gte-small 384-DIM)
// ============================================================

async function createEmbedding(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const input = text.substring(0, 1500);

  const result = await model.run(input, {
    mean_pool: true,
    normalize: true,
  });

  const embedding = Array.from(result as Float32Array).map(Number);
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Vector dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`
    );
  }
  return embedding;
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminKey = req.headers.get("x-admin-key");
    const authHeader = req.headers.get("authorization");
    const expectedAdminKey = Deno.env.get("ADMIN_KEY");

    // Allow Admin Key or valid Service Role / User JWT
    const isAuthorized =
      (expectedAdminKey && adminKey === expectedAdminKey) ||
      (authHeader && authHeader.startsWith("Bearer "));

    if (!isAuthorized) {
      return errorResponse("Unauthorized: Admin or Bearer token required.", 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse("Invalid JSON payload.", 400);
    }

    // ------------------------------------------------------------------------
    // MODE 1: Direct Vector Generation (Query / Single Snippet Embedding)
    // ------------------------------------------------------------------------
    if (body.action === "generate" || (body.input && !body.content && !body.text)) {
      const inputText = cleanString(body.input || body.query);
      if (!inputText) {
        return errorResponse("No input text provided for embedding.", 400);
      }
      const embedding = await createEmbedding(inputText);
      return json({
        embedding,
        dimensions: embedding.length,
        model: "gte-small",
      });
    }

    // ------------------------------------------------------------------------
    // MODE 2: Document Indexing & Storage
    // ------------------------------------------------------------------------
    const rawContent = cleanString(body.text || body.content);
    if (!rawContent || rawContent.length < 10) {
      return errorResponse("Please provide valid statutory text (minimum 10 characters).", 400);
    }

    const jurisdiction = normalizeJurisdiction(body.jurisdiction || body.site);
    const title =
      cleanString(body.title) ||
      rawContent.split("\n")[0].substring(0, 80).trim() ||
      "Untitled Statutory Document";

    // 1. Create or retrieve parent document record
    const { data: docRecord, error: docError } = await supabase
      .from("documents")
      .insert({
        title,
        content: rawContent,
        jurisdiction,
        document_type: cleanString(body.document_type, "statute"),
        authority_level: cleanString(body.authority_level, "primary"),
        current_status: cleanString(body.current_status, "verified"),
        official_source: cleanString(body.official_source) || null,
        source_url: cleanString(body.source_url) || null,
        status: "processing",
        total_sections: 0,
        processed_sections: 0,
      })
      .select()
      .single();

    if (docError || !docRecord) {
      return errorResponse(`Failed to register document: ${docError?.message}`, 500);
    }

    // 2. Parse statutory chunks
    const chunks = chunkLegalContent(title, rawContent, jurisdiction);
    const chunkRecords: Record<string, unknown>[] = [];

    // 3. Generate 384-dim embeddings for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const embedding = await createEmbedding(c.content);

      chunkRecords.push({
        document_id: docRecord.id,
        content: c.content,
        embedding,
        section_number: c.section_number,
        subsection: c.subsection,
        source_locator: c.source_locator,
      });
    }

    // 4. Batch insert into knowledge_chunks
    const { error: chunkInsertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRecords);

    if (chunkInsertError) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_log: chunkInsertError.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", docRecord.id);

      return errorResponse(`Failed to store vector chunks: ${chunkInsertError.message}`, 500);
    }

    // 5. Finalize document status
    await supabase
      .from("documents")
      .update({
        status: "completed",
        total_sections: chunks.length,
        processed_sections: chunks.length,
        error_log: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", docRecord.id);

    return json({
      success: true,
      message: `Successfully indexed ${chunks.length} contextual chunk(s) into knowledge base.`,
      document_id: docRecord.id,
      sections_indexed: chunks.length,
      jurisdiction,
    });
  } catch (error) {
    console.error("Embedding Service Error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal embedding error",
      500
    );
  }
});
