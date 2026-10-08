import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods":
    "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// ============================================================
// CONFIGURATION
// ============================================================

const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;   // 20 MB
const FETCH_TIMEOUT_MS = 30_000;

const EMBEDDING_DIM = 384;
const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 12;

const VALID_AUTHORITY_LEVELS = [
  "primary",
  "secondary",
  "orientation",
];

const VALID_CURRENT_STATUSES = [
  "verified",
  "partially_verified",
  "unverified",
  "repealed",
  "superseded",
  "amended",
  "pending_review",
];

const VALID_INGESTION_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "rejected",
];

const VALID_DOCUMENT_TYPES = [
  "constitution",
  "statute",
  "regulation",
  "rule",
  "case",
  "judgment",
  "amendment",
  "legal_guidance",
  "orientation",
  "principle",
];

// ============================================================
// BASIC HELPERS
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function errorResponse(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return json(
    {
      error: message,
      ...extra,
    },
    status
  );
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(n), min), max);
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
    "u.s.": "us",
    "u.s": "us",

    global: "global",
  };

  return aliases[valueString] || valueString;
}

function normalizeDocumentType(value: unknown): string {
  const type = cleanString(value, "statute").toLowerCase();

  if (VALID_DOCUMENT_TYPES.includes(type)) {
    return type;
  }

  return "statute";
}

function normalizeAuthorityLevel(value: unknown): string {
  const level = cleanString(value, "primary").toLowerCase();

  if (VALID_AUTHORITY_LEVELS.includes(level)) {
    return level;
  }

  return "primary";
}

function normalizeCurrentStatus(value: unknown): string {
  const status = cleanString(value, "unverified").toLowerCase();

  if (VALID_CURRENT_STATUSES.includes(status)) {
    return status;
  }

  return "unverified";
}

function normalizeIngestionStatus(value: unknown): string {
  const status = cleanString(value, "pending").toLowerCase();

  if (VALID_INGESTION_STATUSES.includes(status)) {
    return status;
  }

  return "pending";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return _;
      }
    });
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ============================================================
// SSRF PROTECTION
// ============================================================

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return false;
  }

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (h === "::1") return true;
  if (h === "::") return true;
  if (h.startsWith("fc")) return true;
  if (h.startsWith("fd")) return true;
  if (h.startsWith("fe8")) return true;
  if (h.startsWith("fe9")) return true;
  if (h.startsWith("fea")) return true;
  if (h.startsWith("feb")) return true;

  return false;
}

function validateExternalUrl(rawUrl: string): URL {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Local/private network URLs are not allowed.");
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    throw new Error("Private network URLs are not allowed.");
  }

  if (
    hostname.includes("supabase.co") ||
    hostname.includes("supabase.in") ||
    hostname.includes("supabase.net")
  ) {
    throw new Error("Internal Supabase URLs are not allowed.");
  }

  if (
    hostname === "metadata.google.internal" ||
    hostname === "metadata.google" ||
    hostname === "169.254.169.254"
  ) {
    throw new Error("Cloud metadata endpoints are not allowed.");
  }

  return url;
}

// ============================================================
// SAFE FETCH WITH REDIRECT VALIDATION
// ============================================================

async function safeFetch(
  initialUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
  } = {}
): Promise<{
  response: Response;
  finalUrl: string;
}> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_DOWNLOAD_SIZE;

  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    const validated = validateExternalUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;

    try {
      response = await fetch(validated.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "LexAI-Legal-Admin/1.0",
          Accept:
            "text/html,application/pdf,text/plain,application/xhtml+xml,*/*;q=0.8",
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("External URL request timed out.");
      }

      throw new Error(
        `Unable to fetch external URL: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      clearTimeout(timeout);
    }

    // Redirect
    if (
      [301, 302, 303, 307, 308].includes(response.status)
    ) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error("External server returned an invalid redirect.");
      }

      const nextUrl = new URL(location, validated);

      // IMPORTANT:
      // Validate EVERY redirect destination.
      validateExternalUrl(nextUrl.toString());

      currentUrl = nextUrl.toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `External server returned HTTP ${response.status}.`
      );
    }

    const contentLength = Number(
      response.headers.get("content-length") || "0"
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > maxBytes
    ) {
      throw new Error(
        `External document exceeds the ${Math.round(
          maxBytes / 1024 / 1024
        )} MB download limit.`
      );
    }

    return {
      response,
      finalUrl: validated.toString(),
    };
  }

  throw new Error("Too many redirects.");
}

// ============================================================
// HTML EXTRACTION
// ============================================================

function htmlToText(html: string): string {
  let text = html;

  text = text.replace(
    /<(script|style|noscript|iframe|svg|canvas|nav|footer|header|form|button)[^>]*>[\s\S]*?<\/\1>/gi,
    "\n"
  );

  text = text.replace(
    /<(br|\/p|\/div|\/section|\/article|\/li|\/tr|\/h[1-6])[^>]*>/gi,
    "\n"
  );

  text = text.replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text);

  return normalizeWhitespace(text);
}

// ============================================================
// LEGAL SECTION DETECTION
// ============================================================

const SECTION_HEADING_PATTERN =
  /^(?:(?:SECTION|Section|ARTICLE|Article|ART\.?|Art\.?)\s+(\d+[A-Za-z]*)(?:\s*[\.\-—:]|\s|$)|(\d+[A-Za-z]*)\s*[\.\-—:])\s*(.*)$/;

const SUBSECTION_PATTERN =
  /^\((\d+|[a-z]|[ivxlcdm]+)\)\s*/i;

function detectSectionNumber(line: string): {
  sectionNumber: string | null;
  heading: string;
} {
  const trimmed = line.trim();

  const match = trimmed.match(SECTION_HEADING_PATTERN);

  if (!match) {
    return {
      sectionNumber: null,
      heading: trimmed,
    };
  }

  const sectionNumber = match[1] || match[2] || null;

  return {
    sectionNumber,
    heading: (match[3] || "").trim(),
  };
}

function detectSubsection(line: string): string | null {
  const match = line.trim().match(SUBSECTION_PATTERN);

  return match ? `(${match[1]})` : null;
}

// ============================================================
// PAGE DETECTION
// ============================================================

function splitTextIntoPages(text: string): string[] {
  const formFeedPages = text
    .split(/\f+/)
    .map((page) => page.trim())
    .filter(Boolean);

  if (formFeedPages.length > 1) {
    return formFeedPages;
  }

  return [text.trim()];
}

// ============================================================
// LEGAL CHUNKING
// ============================================================

interface LegalChunk {
  content: string;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
}

function buildSourceLocator(
  title: string,
  sectionNumber: string | null,
  subsection: string | null,
  chunkIndex: number
): string {
  let locator = title;

  if (sectionNumber) {
    locator += `, s.${sectionNumber}`;

    if (subsection) {
      locator += subsection;
    }
  }

  locator += `, chunk ${chunkIndex + 1}`;

  return locator;
}

function chunkLegalContent(
  title: string,
  content: string,
  maxChars = 1500
): LegalChunk[] {
  const normalized = normalizeWhitespace(content);

  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: LegalChunk[] = [];

  let currentLines: string[] = [];
  let currentSection: string | null = null;
  let currentSubsection: string | null = null;

  const flush = () => {
    if (!currentLines.length) return;

    const chunkText = currentLines.join("\n").trim();

    if (!chunkText) {
      currentLines = [];
      return;
    }

    const index = chunks.length;

    chunks.push({
      content: chunkText,
      section_number: currentSection,
      subsection: currentSubsection,
      source_locator: buildSourceLocator(
        title,
        currentSection,
        currentSubsection,
        index
      ),
    });

    currentLines = [];
  };

  for (const line of lines) {
    const detected = detectSectionNumber(line);

    // Only treat explicit legal-style headings as section boundaries.
    if (detected.sectionNumber) {
      if (currentLines.length) {
        flush();
      }

      currentSection = detected.sectionNumber;
      currentSubsection = null;

      currentLines.push(line);
      continue;
    }

    const subsection = detectSubsection(line);

    if (subsection && currentLines.length > 0) {
      const proposed = [...currentLines, line].join("\n");

      if (proposed.length > maxChars) {
        flush();
      }

      currentSubsection = subsection;
      currentLines.push(line);
      continue;
    }

    const proposed = [...currentLines, line].join("\n");

    if (
      currentLines.length > 0 &&
      proposed.length > maxChars
    ) {
      flush();

      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  flush();

  // Fallback for very short documents.
  if (chunks.length === 0) {
    return [
      {
        content: normalized,
        section_number: null,
        subsection: null,
        source_locator: buildSourceLocator(
          title,
          null,
          null,
          0
        ),
      },
    ];
  }

  return chunks;
}

// ============================================================
// EMBEDDING
// ============================================================

async function createEmbedding(text: string): Promise<number[]> {
  // Supabase's built-in gte-small model.
  // IMPORTANT: this must remain 384 dimensions because
  // knowledge_chunks.embedding and match_legal_chunks()
  // currently use vector(384).

  const model = new Supabase.ai.Session("gte-small");

  const result = await model.run(
    text.substring(0, 1000),
    {
      mean_pool: true,
      normalize: true,
    }
  );

  const embedding = Array.from(result as Float32Array).map(Number);

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${EMBEDDING_DIM}, received ${embedding.length}.`
    );
  }

  if (
    embedding.some(
      (value) => !Number.isFinite(value)
    )
  ) {
    throw new Error("Embedding contains invalid numeric values.");
  }

  return embedding;
}

// ============================================================
// DOCUMENT DUPLICATE CHECK
// ============================================================

async function findPotentialDuplicate(
  title: string,
  sourceUrl?: string | null,
  versionLabel?: string | null
) {
  const cleanTitle = title.trim();

  const { data: titleMatches, error: titleError } =
    await supabase
      .from("documents")
      .select(
        "id,title,jurisdiction,document_type,status,current_status,source_url,version_label,created_at"
      )
      .ilike("title", cleanTitle)
      .limit(10);

  if (titleError) {
    throw titleError;
  }

  if (sourceUrl) {
    const { data: urlMatches, error: urlError } =
      await supabase
        .from("documents")
        .select(
          "id,title,jurisdiction,document_type,status,current_status,source_url,version_label,created_at"
        )
        .eq("source_url", sourceUrl)
        .limit(10);

    if (urlError) {
      throw urlError;
    }

    if (urlMatches && urlMatches.length > 0) {
      return {
        type: "source_url",
        matches: urlMatches,
      };
    }
  }

  if (titleMatches && titleMatches.length > 0) {
    // Title matches are treated as potential duplicates,
    // not automatically rejected. This is important because
    // the same Act may have an original version, amended version,
    // consolidated version, etc.
    return {
      type: "title",
      matches: titleMatches,
    };
  }

  return null;
}

// ============================================================
// DOCUMENT INGESTION
// ============================================================

async function getDocument(documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error) {
    throw new Error(
      `Unable to load document: ${error.message}`
    );
  }

  return data;
}

async function prepareDocumentForIndexing(documentId: string) {
  const document = await getDocument(documentId);

  if (document.status === "rejected") {
    throw new Error("Rejected documents cannot be indexed.");
  }

  if (!document.content || document.content.trim().length < 10) {
    throw new Error(
      "Document contains insufficient text to index."
    );
  }

  const chunks = chunkLegalContent(
    document.title,
    document.content
  );

  if (chunks.length === 0) {
    throw new Error("No legal chunks could be created.");
  }

  await supabase
    .from("documents")
    .update({
      status: "processing",
      total_sections: chunks.length,
      processed_sections: 0,
      error_log: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  // Remove previous vector chunks only when starting a fresh index.
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("document_id", documentId);

  if (deleteError) {
    throw new Error(
      `Unable to clear previous index: ${deleteError.message}`
    );
  }

  return {
    document,
    chunks,
  };
}

// ============================================================
// INDEX A BATCH
// ============================================================

async function indexDocumentBatch(
  documentId: string,
  offset: number,
  batchSize: number
) {
  const document = await getDocument(documentId);

  if (document.status === "rejected") {
    throw new Error("Rejected documents cannot be indexed.");
  }

  const chunks = chunkLegalContent(
    document.title,
    document.content || ""
  );

  if (!chunks.length) {
    throw new Error("No legal chunks were generated.");
  }

  const totalChunks = chunks.length;

  if (offset >= totalChunks) {
    await supabase
      .from("documents")
      .update({
        status: "completed",
        total_sections: totalChunks,
        processed_sections: totalChunks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return {
      completed: true,
      total: totalChunks,
      processed: totalChunks,
      next_offset: totalChunks,
      inserted: 0,
    };
  }

  await supabase
    .from("documents")
    .update({
      status: "processing",
      total_sections: totalChunks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  const batch = chunks.slice(
    offset,
    offset + batchSize
  );

  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < batch.length; i++) {
    const chunk = batch[i];
    const absoluteIndex = offset + i;

    try {
      const embedding = await createEmbedding(
        chunk.content
      );

      records.push({
        document_id: documentId,
        content: chunk.content,
        embedding,
        section_number: chunk.section_number,
        subsection: chunk.subsection,
        source_locator: buildSourceLocator(
          document.title,
          chunk.section_number,
          chunk.subsection,
          absoluteIndex
        ),
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_log: `Chunk ${
            absoluteIndex + 1
          } failed: ${message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      throw new Error(
        `Embedding failed for chunk ${
          absoluteIndex + 1
        }: ${message}`
      );
    }
  }

  if (records.length > 0) {
    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(records);

    if (insertError) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_log: insertError.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);

      throw new Error(
        `Unable to save embeddings: ${insertError.message}`
      );
    }
  }

  const nextOffset = offset + records.length;
  const completed = nextOffset >= totalChunks;

  await supabase
    .from("documents")
    .update({
      status: completed
        ? "completed"
        : "processing",
      total_sections: totalChunks,
      processed_sections: nextOffset,
      error_log: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return {
    completed,
    total: totalChunks,
    processed: nextOffset,
    next_offset: nextOffset,
    inserted: records.length,
  };
}

// ============================================================
// PDF EXTRACTION
// ============================================================

async function extractPdfText(
  buffer: ArrayBuffer
): Promise<{
  text: string;
  pages: number;
}> {
  try {
    const pdfModule = await import(
      "https://esm.sh/pdf-parse@1.1.1"
    );

    const pdfParse =
      pdfModule.default || pdfModule;

    const parsed = await pdfParse(
      new Uint8Array(buffer)
    );

    const text = normalizeWhitespace(
      parsed.text || ""
    );

    const pages =
      Number(parsed.numpages) ||
      0;

    if (!text || text.length < 20) {
      throw new Error(
        "The PDF contains little or no extractable text. It may be scanned/image-only and require OCR."
      );
    }

    return {
      text,
      pages,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("OCR")
    ) {
      throw error;
    }

    throw new Error(
      `PDF extraction failed. ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

// ============================================================
// CONTENT-TYPE DETECTION
// ============================================================

function detectContentType(
  response: Response,
  finalUrl: string
): string {
  const contentType = (
    response.headers.get("content-type") || ""
  ).toLowerCase();

  if (
    contentType.includes("application/pdf") ||
    finalUrl.toLowerCase().endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml")
  ) {
    return "html";
  }

  return "text";
}

// ============================================================
// DOCUMENT PREVIEW
// ============================================================

function createPreview(
  title: string,
  content: string
) {
  const normalized = normalizeWhitespace(content);

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = new Set<string>();

  for (const line of lines) {
    const detected = detectSectionNumber(line);

    if (detected.sectionNumber) {
      sections.add(
        `Section ${detected.sectionNumber}`
      );
    }
  }

  const chunks = chunkLegalContent(
    title,
    normalized
  );

  return {
    characters: normalized.length,
    words: normalized
      ? normalized.split(/\s+/).length
      : 0,
    lines: lines.length,
    sections: Array.from(sections),
    planned_chunks: chunks.length,
    preview: normalized.substring(0, 12_000),
  };
}

// ============================================================
// SETTINGS
// ============================================================

async function handleSettings(
  method: string,
  req: Request
) {
  if (method === "GET") {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return errorResponse(
        "No LexAI settings row exists.",
        404
      );
    }

    return json(data);
  }

  if (method === "PATCH") {
    const body = await req.json();

    const allowed: Record<string, unknown> = {};

    if (
      typeof body.api_enabled === "boolean"
    ) {
      allowed.api_enabled = body.api_enabled;
    }

    if (
      typeof body.active_model === "string" &&
      body.active_model.trim()
    ) {
      allowed.active_model =
        body.active_model.trim();
    }

    allowed.updated_at =
      new Date().toISOString();

    let query = supabase
      .from("settings")
      .update(allowed);

    if (body.id) {
      query = query.eq("id", body.id);
    }

    const { data, error } = await query
      .select()
      .single();

    if (error) {
      throw error;
    }

    return json(data);
  }

  return errorResponse(
    "Method not allowed.",
    405
  );
}

// ============================================================
// API KEYS
// ============================================================

async function handleKeys(
  method: string,
  path: string,
  req: Request
) {
  if (
    method === "GET" &&
    path === "keys"
  ) {
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) throw error;

    return json(data || []);
  }

  if (
    method === "POST" &&
    path === "keys"
  ) {
    const body = await req.json();

    const site = cleanString(body.site);

    if (!site) {
      return errorResponse(
        "Client firm name is required.",
        400
      );
    }

    const key =
      `lex_${crypto.randomUUID().replace(/-/g, "")}`;

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        key,
        site,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;

    return json(data, 201);
  }

  if (
    method === "DELETE" &&
    path.startsWith("keys/")
  ) {
    const id = path.split("/")[1];

    if (!id) {
      return errorResponse(
        "Key ID is required.",
        400
      );
    }

    const { error } = await supabase
      .from("api_keys")
      .update({
        status: "revoked",
      })
      .eq("id", id);

    if (error) throw error;

    return json({
      success: true,
      message: "Access revoked.",
    });
  }

  return null;
}

// ============================================================
// DOCUMENT LIST
// ============================================================

async function listDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      title,
      jurisdiction,
      document_type,
      authority_level,
      official_source,
      source_url,
      effective_from,
      effective_to,
      current_status,
      last_verified_at,
      verification_source,
      version_label,
      status,
      total_sections,
      processed_sections,
      error_log,
      created_at,
      updated_at
      `
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(100);

  if (error) throw error;

  return json(data || []);
}

// ============================================================
// CREATE DOCUMENT
// ============================================================

async function createDocument(req: Request) {
  const body = await req.json();

  const title = cleanString(body.title);

  const content =
    typeof body.content === "string"
      ? body.content.trim()
      : "";

  const jurisdiction =
    normalizeJurisdiction(
      body.jurisdiction
    );

  const documentType =
    normalizeDocumentType(
      body.document_type
    );

  const authorityLevel =
    normalizeAuthorityLevel(
      body.authority_level
    );

  const currentStatus =
    normalizeCurrentStatus(
      body.current_status
    );

  if (!title) {
    return errorResponse(
      "Document title is required.",
      400
    );
  }

  if (content.length < 10) {
    return errorResponse(
      "Document content is too short.",
      400
    );
  }

  if (content.length > 50 * 1024 * 1024) {
    return errorResponse(
      "Document text exceeds the 50 MB text limit.",
      400
    );
  }

  const duplicate =
    await findPotentialDuplicate(
      title,
      body.source_url || null,
      body.version_label || null
    );

  if (
    duplicate?.type === "source_url"
  ) {
    return errorResponse(
      "A document with this source URL already exists.",
      409,
      {
        duplicate: true,
        duplicate_type: duplicate.type,
        matches: duplicate.matches,
      }
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      content,
      jurisdiction,
      document_type: documentType,

      authority_level: authorityLevel,

      official_source:
        cleanString(
          body.official_source
        ) || null,

      source_url:
        cleanString(body.source_url) || null,

      effective_from:
        cleanString(body.effective_from) || null,

      effective_to:
        cleanString(body.effective_to) || null,

      current_status: currentStatus,

      last_verified_at:
        body.last_verified_at || null,

      verification_source:
        cleanString(
          body.verification_source
        ) || null,

      version_label:
        cleanString(body.version_label) || null,

      status: "pending",
      total_sections: 0,
      processed_sections: 0,
      error_log: null,
    })
    .select()
    .single();

  if (error) throw error;

  return json(
    {
      success: true,
      message:
        "Legal document registered and awaiting indexing.",
      document: data,
      duplicate_warning:
        duplicate?.type === "title"
          ? {
              type: "title",
              matches: duplicate.matches,
              message:
                "A document with the same title already exists. This upload was allowed because different versions/amendments may legitimately share a title.",
            }
          : null,
    },
    201
  );
}

// ============================================================
// IMPORT URL
// ============================================================

async function importFromUrl(req: Request) {
  const body = await req.json();

  const sourceUrl = cleanString(
    body.url
  );

  if (!sourceUrl) {
    return errorResponse(
      "URL is required.",
      400
    );
  }

  const initialUrl =
    validateExternalUrl(sourceUrl);

  const { response, finalUrl } =
    await safeFetch(
      initialUrl.toString()
    );

  const contentType =
    detectContentType(
      response,
      finalUrl
    );

  const buffer =
    await response.arrayBuffer();

  if (
    buffer.byteLength >
    MAX_DOWNLOAD_SIZE
  ) {
    return errorResponse(
      "Downloaded document exceeds the 10 MB limit.",
      400
    );
  }

  let content = "";
  let pages = 0;

  if (contentType === "pdf") {
    const extracted =
      await extractPdfText(buffer);

    content = extracted.text;
    pages = extracted.pages;
  } else {
    const rawText =
      new TextDecoder().decode(buffer);

    if (contentType === "html") {
      content = htmlToText(rawText);
    } else {
      content = normalizeWhitespace(
        rawText
      );
    }
  }

  if (content.length < 20) {
    return errorResponse(
      "The URL did not provide enough extractable legal text.",
      422
    );
  }

  const suppliedTitle =
    cleanString(body.title);

  const title =
    suppliedTitle ||
    decodeURIComponent(
      new URL(finalUrl).pathname
        .split("/")
        .filter(Boolean)
        .pop() ||
        new URL(finalUrl).hostname
    );

  const preview =
    createPreview(
      title,
      content
    );

  return json({
    success: true,
    source_url: finalUrl,
    detected_type: contentType,
    pages_detected: pages,
    title,
    content,
    preview,
  });
}

// ============================================================
// FILE UPLOAD
// ============================================================

async function uploadDocument(req: Request) {
  const contentType =
    req.headers.get("content-type") ||
    "";

  if (
    !contentType.includes(
      "multipart/form-data"
    )
  ) {
    return errorResponse(
      "Upload must use multipart/form-data.",
      400
    );
  }

  const form =
    await req.formData();

  const file =
    form.get("file");

  if (!(file instanceof File)) {
    return errorResponse(
      "No document file was provided.",
      400
    );
  }

  if (
    file.size >
    MAX_UPLOAD_SIZE
  ) {
    return errorResponse(
      "Uploaded file exceeds the 20 MB limit.",
      400
    );
  }

  const filename =
    file.name.toLowerCase();

  const blockedExtensions = [
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".sh",
    ".js",
    ".ts",
    ".php",
    ".py",
    ".jar",
    ".msi",
    ".scr",
    ".com",
  ];

  if (
    blockedExtensions.some((ext) =>
      filename.endsWith(ext)
    )
  ) {
    return errorResponse(
      "Executable or script files are not allowed.",
      400
    );
  }

  const arrayBuffer =
    await file.arrayBuffer();

  let extractedText = "";
  let pages = 0;

  const isPdf =
    file.type === "application/pdf" ||
    filename.endsWith(".pdf");

  const isHtml =
    file.type.includes("html") ||
    filename.endsWith(".html") ||
    filename.endsWith(".htm");

  if (isPdf) {
    const extracted =
      await extractPdfText(
        arrayBuffer
      );

    extractedText =
      extracted.text;

    pages =
      extracted.pages;
  } else {
    const raw =
      new TextDecoder().decode(
        arrayBuffer
      );

    extractedText = isHtml
      ? htmlToText(raw)
      : normalizeWhitespace(raw);
  }

  if (extractedText.length < 20) {
    return errorResponse(
      "The uploaded file contains insufficient extractable text. If it is a scanned PDF, OCR is required before ingestion.",
      422
    );
  }

  const title =
    cleanString(
      form.get("title")
    ) ||
    file.name.replace(
      /\.[^.]+$/,
      ""
    );

  const jurisdiction =
    normalizeJurisdiction(
      form.get("jurisdiction")
    );

  const documentType =
    normalizeDocumentType(
      form.get("document_type")
    );

  const authorityLevel =
    normalizeAuthorityLevel(
      form.get("authority_level")
    );

  const currentStatus =
    normalizeCurrentStatus(
      form.get("current_status")
    );

  const sourceUrl =
    cleanString(
      form.get("source_url")
    ) || null;

  const officialSource =
    cleanString(
      form.get("official_source")
    ) || null;

  const versionLabel =
    cleanString(
      form.get("version_label")
    ) || null;

  const preview =
    createPreview(
      title,
      extractedText
    );

  return json({
    success: true,
    title,
    filename: file.name,
    file_type:
      file.type || "unknown",
    jurisdiction,
    document_type: documentType,
    authority_level: authorityLevel,
    current_status: currentStatus,
    official_source: officialSource,
    source_url: sourceUrl,
    version_label: versionLabel,
    pages_detected: pages,
    content: extractedText,
    preview,
  });
}

// ============================================================
// DOCUMENT PREVIEW
// ============================================================

async function previewDocument(
  documentId: string
) {
  const document =
    await getDocument(
      documentId
    );

  const preview =
    createPreview(
      document.title,
      document.content || ""
    );

  const { data: chunks, error } =
    await supabase
      .from("knowledge_chunks")
      .select(
        "id,content,section_number,subsection,source_locator"
      )
      .eq("document_id", documentId)
      .order("id", {
        ascending: true,
      })
      .limit(20);

  if (error) throw error;

  return json({
    success: true,

    metadata: {
      id: document.id,
      title: document.title,
      jurisdiction:
        document.jurisdiction,
      document_type:
        document.document_type,
      authority_level:
        document.authority_level,
      official_source:
        document.official_source,
      source_url:
        document.source_url,
      effective_from:
        document.effective_from,
      effective_to:
        document.effective_to,
      current_status:
        document.current_status,
      last_verified_at:
        document.last_verified_at,
      verification_source:
        document.verification_source,
      version_label:
        document.version_label,
      status:
        document.status,
    },

    full_content:
      document.content || "",

    sections:
      preview.sections,

    planned_chunks:
      preview.planned_chunks,

    pages_detected: 0,

    indexed_chunks:
      chunks || [],
  });
}

// ============================================================
// START INDEXING
// ============================================================

async function startIndexing(
  documentId: string,
  req: Request,
  reset: boolean
) {
  const document =
    await getDocument(
      documentId
    );

  if (
    document.status === "rejected"
  ) {
    return errorResponse(
      "Rejected documents cannot be indexed.",
      400
    );
  }

  const url =
    new URL(req.url);

  const batchSize =
    safeInteger(
      url.searchParams.get(
        "batch_size"
      ),
      DEFAULT_BATCH_SIZE,
      1,
      MAX_BATCH_SIZE
    );

  let offset = 0;

  if (reset) {
    await prepareDocumentForIndexing(
      documentId
    );
  } else {
    offset =
      Number(
        document.processed_sections || 0
      );

    // If status is pending and no previous progress exists,
    // start cleanly.
    if (
      document.status === "pending" &&
      offset === 0
    ) {
      await prepareDocumentForIndexing(
        documentId
      );
    }
  }

  const result =
    await indexDocumentBatch(
      documentId,
      offset,
      batchSize
    );

  return json({
    success: true,
    message: result.completed
      ? "Document indexing completed."
      : "Document batch indexed. Continue indexing to complete the document.",
    document_id: documentId,
    ...result,
  });
}

// ============================================================
// REINDEX
// ============================================================

async function reindexDocument(
  documentId: string,
  req: Request
) {
  return startIndexing(
    documentId,
    req,
    true
  );
}

// ============================================================
// VERIFICATION
// ============================================================

async function verifyDocument(
  documentId: string,
  req: Request
) {
  const body =
    await req.json();

  const currentStatus =
    normalizeCurrentStatus(
      body.current_status
    );

  const updates: Record<
    string,
    unknown
  > = {
    current_status:
      currentStatus,

    updated_at:
      new Date().toISOString(),
  };

  if (
    "authority_level" in body
  ) {
    updates.authority_level =
      normalizeAuthorityLevel(
        body.authority_level
      );
  }

  if (
    "official_source" in body
  ) {
    updates.official_source =
      cleanString(
        body.official_source
      ) || null;
  }

  if (
    "source_url" in body
  ) {
    updates.source_url =
      cleanString(
        body.source_url
      ) || null;
  }

  if (
    "effective_from" in body
  ) {
    updates.effective_from =
      cleanString(
        body.effective_from
      ) || null;
  }

  if (
    "effective_to" in body
  ) {
    updates.effective_to =
      cleanString(
        body.effective_to
      ) || null;
  }

  if (
    "verification_source" in body
  ) {
    updates.verification_source =
      cleanString(
        body.verification_source
      ) || null;
  }

  if (
    "version_label" in body
  ) {
    updates.version_label =
      cleanString(
        body.version_label
      ) || null;
  }

  // If an administrator explicitly marks the document verified
  // and no verification timestamp was supplied, record the time.
  if (
    currentStatus === "verified" ||
    currentStatus === "partially_verified"
  ) {
    updates.last_verified_at =
      body.last_verified_at ||
      new Date().toISOString();
  } else if (
    "last_verified_at" in body
  ) {
    updates.last_verified_at =
      body.last_verified_at ||
      null;
  }

  const { data, error } =
    await supabase
      .from("documents")
      .update(updates)
      .eq("id", documentId)
      .select()
      .single();

  if (error) throw error;

  return json({
    success: true,
    message:
      "Document verification metadata updated.",
    document: data,
  });
}

// ============================================================
// REJECT DOCUMENT
// ============================================================

async function rejectDocument(
  documentId: string
) {
  const { data, error } =
    await supabase
      .from("documents")
      .update({
        status: "rejected",
        error_log:
          "Rejected by administrator.",
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", documentId)
      .select()
      .single();

  if (error) throw error;

  return json({
    success: true,
    message:
      "Document rejected.",
    document: data,
  });
}

// ============================================================
// DELETE DOCUMENT
// ============================================================

async function deleteDocument(
  documentId: string
) {
  // Delete dependent chunks first.
  const { error: chunkError } =
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

  if (chunkError) {
    throw new Error(
      `Unable to remove knowledge chunks: ${chunkError.message}`
    );
  }

  const { error: documentError } =
    await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

  if (documentError) {
    throw new Error(
      `Knowledge chunks were removed, but the document could not be deleted: ${documentError.message}`
    );
  }

  return json({
    success: true,
    message:
      "Document and indexed knowledge removed.",
  });
}

// ============================================================
// MAIN ROUTER
// ============================================================

serve(async (req) => {
  if (
    req.method === "OPTIONS"
  ) {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
  }

  try {
    // --------------------------------------------------------
    // ADMIN AUTHENTICATION
    // --------------------------------------------------------

    const adminKey =
      req.headers.get(
        "x-admin-key"
      );

    const expectedKey =
      Deno.env.get(
        "ADMIN_KEY"
      );

    if (!expectedKey) {
      return errorResponse(
        "Server misconfiguration: ADMIN_KEY is not configured.",
        500
      );
    }

    if (
      !adminKey ||
      adminKey !== expectedKey
    ) {
      return errorResponse(
        "Forbidden: invalid administrator key.",
        403
      );
    }

    // --------------------------------------------------------
    // ROUTING
    // --------------------------------------------------------

    const url =
      new URL(req.url);

    let path =
      url.pathname;

    // Handles:
    // /functions/v1/admin/settings
    // /admin/settings
    // /settings
    path = path.replace(
      /^.*\/admin\//,
      ""
    );

    if (
      path === url.pathname &&
      path.startsWith("admin/")
    ) {
      path =
        path.substring(
          "admin/".length
        );
    }

    path =
      path.replace(
        /^\/+/,
        ""
      ).replace(
        /\/+$/,
        ""
      );

    const method =
      req.method.toUpperCase();

    // --------------------------------------------------------
    // SETTINGS
    // --------------------------------------------------------

    if (
      path === "settings"
    ) {
      return await handleSettings(
        method,
        req
      );
    }

    // --------------------------------------------------------
    // API KEYS
    // --------------------------------------------------------

    const keyResponse =
      await handleKeys(
        method,
        path,
        req
      );

    if (keyResponse) {
      return keyResponse;
    }

    // --------------------------------------------------------
    // DOCUMENT LIST
    // --------------------------------------------------------

    if (
      method === "GET" &&
      path === "documents"
    ) {
      return await listDocuments();
    }

    // --------------------------------------------------------
    // CREATE PASTED DOCUMENT
    // --------------------------------------------------------

    if (
      method === "POST" &&
      path === "documents"
    ) {
      return await createDocument(
        req
      );
    }

    // --------------------------------------------------------
    // LEGACY /embed COMPATIBILITY
    //
    // We deliberately do NOT use the old schema.
    // This route now creates a proper legal document.
    // --------------------------------------------------------

    if (
      method === "POST" &&
      path === "embed"
    ) {
      const body =
        await req.json();

      const content =
        cleanString(
          body.text ||
            body.content
        );

      if (!content) {
        return errorResponse(
          "Legal text is required.",
          400
        );
      }

      const compatibleRequest =
        new Request(
          req.url,
          {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify({
              title:
                body.title ||
                "Imported Legal Material",
              content,
              jurisdiction:
                body.jurisdiction ||
                body.site ||
                "nigeria",
              document_type:
                body.document_type ||
                "statute",
              authority_level:
                body.authority_level ||
                "orientation",
              current_status:
                "unverified",
            }),
          }
        );

      return await createDocument(
        compatibleRequest
      );
    }

    // --------------------------------------------------------
    // IMPORT URL
    // --------------------------------------------------------

    if (
      method === "POST" &&
      path ===
        "documents/import-url"
    ) {
      return await importFromUrl(
        req
      );
    }

    // --------------------------------------------------------
    // UPLOAD FILE
    // --------------------------------------------------------

    if (
      method === "POST" &&
      path ===
        "documents/upload"
    ) {
      return await uploadDocument(
        req
      );
    }

    // --------------------------------------------------------
    // DOCUMENT-SPECIFIC ROUTES
    // --------------------------------------------------------

    const documentMatch =
      path.match(
        /^documents\/([^/]+)(?:\/(.*))?$/
      );

    if (
      documentMatch
    ) {
      const documentId =
        documentMatch[1];

      const action =
        documentMatch[2] ||
        "";

      // ------------------------------
      // PREVIEW
      // ------------------------------

      if (
        method === "GET" &&
        action === "preview"
      ) {
        return await previewDocument(
          documentId
        );
      }

      // ------------------------------
      // INDEX
      // ------------------------------

      if (
        method === "POST" &&
        action === "index"
      ) {
        const reset =
          url.searchParams.get(
            "reset"
          ) === "true";

        return await startIndexing(
          documentId,
          req,
          reset
        );
      }

      // ------------------------------
      // REINDEX
      // ------------------------------

      if (
        method === "POST" &&
        action === "reindex"
      ) {
        return await reindexDocument(
          documentId,
          req
        );
      }

      // ------------------------------
      // VERIFICATION
      // ------------------------------

      if (
        method === "PATCH" &&
        action === "verification"
      ) {
        return await verifyDocument(
          documentId,
          req
        );
      }

      // ------------------------------
      // REJECT
      // ------------------------------

      if (
        method === "PATCH" &&
        action === "reject"
      ) {
        return await rejectDocument(
          documentId
        );
      }

      // ------------------------------
      // DELETE
      // ------------------------------

      if (
        method === "DELETE" &&
        !action
      ) {
        return await deleteDocument(
          documentId
        );
      }
    }

    return errorResponse(
      "Admin endpoint not found.",
      404
    );
  } catch (error) {
    console.error(
      "LexAI Admin Error:",
      error
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Internal server error.",
      500
    );
  }
});
