// supabase/functions/admin/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_KEY = Deno.env.get("ADMIN_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_KEY) {
  console.error("Missing required environment variables.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 30_000;

const EMBEDDING_DIM = 384;

// Keep this conservative because Supabase Edge Functions have execution limits.
const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 12;

const MAX_REDIRECTS = 5;

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
];

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods":
    "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        ...extraHeaders,
      },
    },
  );
}

function success(
  data: unknown = null,
  message = "Success",
  status = 200,
) {
  return jsonResponse(
    {
      success: true,
      data,
      message,
    },
    status,
  );
}

function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
) {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    status,
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeJurisdiction(value: unknown): string {
  return cleanString(value)?.toLowerCase() || "nigeria";
}

function normalizeDocumentType(value: unknown): string {
  const type = cleanString(value)?.toLowerCase() || "statute";

  return VALID_DOCUMENT_TYPES.includes(type)
    ? type
    : "statute";
}

function normalizeAuthorityLevel(value: unknown): string {
  const level = cleanString(value)?.toLowerCase() || "primary";

  return VALID_AUTHORITY_LEVELS.includes(level)
    ? level
    : "primary";
}

function normalizeCurrentStatus(value: unknown): string {
  const status = cleanString(value)?.toLowerCase() || "unverified";

  return VALID_CURRENT_STATUSES.includes(status)
    ? status
    : "unverified";
}

function normalizeIngestionStatus(value: unknown): string {
  const status = cleanString(value)?.toLowerCase() || "pending";

  return VALID_INGESTION_STATUSES.includes(status)
    ? status
    : "pending";
}

function clampBatchSize(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    Math.max(Math.floor(parsed), 1),
    MAX_BATCH_SIZE,
  );
}

function getPath(url: string): string[] {
  return new URL(url).pathname
    .split("/")
    .filter(Boolean);
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

// -----------------------------------------------------------------------------
// ADMIN AUTH
// -----------------------------------------------------------------------------

function isAdmin(event: Request): boolean {
  const suppliedKey = event.headers.get("x-admin-key");

  if (!suppliedKey || !ADMIN_KEY) {
    return false;
  }

  return suppliedKey === ADMIN_KEY;
}

// -----------------------------------------------------------------------------
// SSRF PROTECTION
// -----------------------------------------------------------------------------

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");

  if (parts.length !== 4) return false;

  const nums = parts.map(Number);

  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = nums;

  if (a === 10) return true;

  if (a === 127) return true;

  if (a === 169 && b === 254) return true;

  if (a === 172 && b >= 16 && b <= 31) return true;

  if (a === 192 && b === 168) return true;

  if (a === 100 && b >= 64 && b <= 127) return true;

  if (a === 0) return true;

  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "::1") return true;

  if (host.startsWith("fc")) return true;

  if (host.startsWith("fd")) return true;

  if (host.startsWith("fe80:")) return true;

  return false;
}

function isUnsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (
    host === "localhost" ||
    host === "localhost.localdomain"
  ) {
    return true;
  }

  if (
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (host === "metadata.google.internal") {
    return true;
  }

  if (host === "metadata.google") {
    return true;
  }

  if (host.includes("supabase.co")) {
    return true;
  }

  if (isPrivateIPv4(host)) {
    return true;
  }

  if (isPrivateIPv6(host)) {
    return true;
  }

  return false;
}

function validateRemoteUrl(rawUrl: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      "Only HTTP and HTTPS URLs are allowed.",
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      "URLs containing username/password credentials are not allowed.",
    );
  }

  if (isUnsafeHostname(parsed.hostname)) {
    throw new Error(
      "The supplied URL points to a restricted or private host.",
    );
  }

  return parsed;
}

async function fetchRemoteResource(
  initialUrl: string,
): Promise<{
  response: Response;
  finalUrl: string;
}> {
  let currentUrl = validateRemoteUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS,
    );

    let response: Response;

    try {
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "LexAI-Legal-Document-Importer/1.0",
          Accept:
            "text/html,application/pdf,text/plain,application/xhtml+xml,*/*;q=0.8",
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(
          "Remote request timed out.",
        );
      }

      throw new Error(
        `Remote request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error(
          "Remote server returned a redirect without a Location header.",
        );
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new Error(
          "Too many redirects.",
        );
      }

      const nextUrl = new URL(
        location,
        currentUrl,
      );

      // IMPORTANT:
      // Validate EVERY redirect destination.
      validateRemoteUrl(nextUrl.toString());

      currentUrl = nextUrl;

      continue;
    }

    return {
      response,
      finalUrl: currentUrl.toString(),
    };
  }

  throw new Error("Unable to safely follow remote URL.");
}

async function readResponseWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength =
    response.headers.get("content-length");

  if (contentLength) {
    const length = Number(contentLength);

    if (
      Number.isFinite(length) &&
      length > maxBytes
    ) {
      throw new Error(
        `Remote file exceeds the ${Math.round(
          maxBytes / 1024 / 1024,
        )}MB limit.`,
      );
    }
  }

  if (!response.body) {
    const buffer = new Uint8Array(
      await response.arrayBuffer(),
    );

    if (buffer.byteLength > maxBytes) {
      throw new Error(
        "Remote file exceeds the maximum allowed size.",
      );
    }

    return buffer;
  }

  const reader = response.body.getReader();

  const chunks: Uint8Array[] = [];

  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    if (!value) continue;

    total += value.byteLength;

    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation failure.
      }

      throw new Error(
        "Remote file exceeds the maximum allowed size.",
      );
    }

    chunks.push(value);
  }

  const output = new Uint8Array(total);

  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

// -----------------------------------------------------------------------------
// HTML / TEXT EXTRACTION
// -----------------------------------------------------------------------------

function extractHtmlText(html: string): string {
  let text = html;

  text = text.replace(
    /<(script|style|noscript|nav|footer|header|svg|canvas)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  text = text.replace(
    /<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi,
    "\n",
  );

  text = text.replace(
    /<[^>]+>/g,
    " ",
  );

  text = decodeHtmlEntities(text);

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// -----------------------------------------------------------------------------
// PDF EXTRACTION
// -----------------------------------------------------------------------------

async function extractPdfText(
  buffer: Uint8Array,
): Promise<{
  text: string;
  pages: number;
  hasPageBreaks: boolean;
}> {
  let pdfParse: any;

  try {
    const module = await import(
      "https://esm.sh/pdf-parse@1.1.1"
    );

    pdfParse = module.default || module;
  } catch (err) {
    throw new Error(
      `Unable to load PDF parser: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  try {
    const result = await pdfParse(buffer);

    const text = String(result.text || "");

    const pages = Number(result.numpages || 0);

    const hasPageBreaks = text.includes("\f");

    if (!text.trim()) {
      throw new Error(
        "The PDF contains no extractable text. It may be a scanned/image-only PDF and require OCR.",
      );
    }

    return {
      text,
      pages: pages || (hasPageBreaks
        ? text.split(/\f/).length
        : 1),
      hasPageBreaks,
    };
  } catch (err) {
    throw new Error(
      `PDF extraction failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// -----------------------------------------------------------------------------
// LEGAL SECTION DETECTION
// -----------------------------------------------------------------------------

/*
 * We deliberately do NOT treat every "1." in a document as a legal section.
 *
 * Preferred forms:
 *   Section 84
 *   SECTION 84
 *   Section 84.
 *   S. 84
 *   s. 84
 *   Article 12
 *
 * We also accept a bare "84." only when the line looks like a heading.
 */

const EXPLICIT_SECTION_PATTERN =
  /^\s*(?:section|sec\.?|s\.|article|art\.?)\s+(\d+[A-Za-z-]*)\s*[\.\-—:]?\s*(.*)$/i;

const BARE_SECTION_PATTERN =
  /^\s*(\d+[A-Za-z]*)\.\s+([A-Z][A-Za-z0-9 ,;:'"()\/\-—]{2,180})\s*$/;

const SUBSECTION_PATTERN =
  /^\s*\((\d+|[a-z]|[ivx]+)\)\s*/i;

function detectSectionNumber(
  line: string,
): {
  section: string | null;
  heading: string;
} {
  const explicit =
    line.match(EXPLICIT_SECTION_PATTERN);

  if (explicit) {
    return {
      section: explicit[1],
      heading: explicit[2]?.trim() || "",
    };
  }

  const bare =
    line.match(BARE_SECTION_PATTERN);

  if (bare) {
    return {
      section: bare[1],
      heading: bare[2].trim(),
    };
  }

  return {
    section: null,
    heading: "",
  };
}

function detectSubsection(
  line: string,
): string | null {
  const match = line.match(
    SUBSECTION_PATTERN,
  );

  return match?.[1] || null;
}

function buildSourceLocator(
  title: string,
  section: string | null,
  subsection: string | null,
  page: number | null,
): string {
  const parts: string[] = [];

  if (title) {
    parts.push(title);
  }

  if (section) {
    let locator = `s.${section}`;

    if (subsection) {
      locator += `(${subsection})`;
    }

    parts.push(locator);
  }

  if (page && page > 0) {
    parts.push(`p.${page}`);
  }

  return parts.join(", ");
}

// -----------------------------------------------------------------------------
// PAGE-AWARE NORMALIZATION
// -----------------------------------------------------------------------------

interface PageBlock {
  page: number;
  text: string;
}

function splitIntoPages(
  rawText: string,
): PageBlock[] {
  const normalized =
    rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (normalized.includes("\f")) {
    return normalized
      .split(/\f/g)
      .map((text, index) => ({
        page: index + 1,
        text: text.trim(),
      }))
      .filter((item) => item.text.length > 0);
  }

  return [
    {
      page: 1,
      text: normalized.trim(),
    },
  ];
}

// -----------------------------------------------------------------------------
// LEGAL CHUNKING
// -----------------------------------------------------------------------------

interface LegalChunk {
  index: number;
  content: string;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
}

function chunkLegalContent(
  title: string,
  rawText: string,
): LegalChunk[] {
  const pages = splitIntoPages(rawText);

  const chunks: LegalChunk[] = [];

  let currentLines: string[] = [];

  let currentSection: string | null = null;

  let currentSubsection: string | null = null;

  let currentPage = 1;

  const MAX_CHARS = 1500;

  function flushChunk() {
    const content = currentLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!content) {
      currentLines = [];
      return;
    }

    chunks.push({
      index: chunks.length,
      content,
      section_number: currentSection,
      subsection: currentSubsection,
      source_locator: buildSourceLocator(
        title,
        currentSection,
        currentSubsection,
        currentPage,
      ),
    });

    currentLines = [];
  }

  function addLine(line: string) {
    const clean = line.trim();

    if (!clean) {
      if (
        currentLines.length > 0 &&
        currentLines[currentLines.length - 1] !== ""
      ) {
        currentLines.push("");
      }

      return;
    }

    if (
      currentLines.join("\n").length +
        clean.length +
        1 >
      MAX_CHARS
    ) {
      flushChunk();
    }

    currentLines.push(clean);
  }

  for (const page of pages) {
    currentPage = page.page;

    const lines = page.text.split("\n");

    for (const line of lines) {
      const sectionInfo =
        detectSectionNumber(line);

      if (sectionInfo.section) {
        flushChunk();

        currentSection =
          sectionInfo.section;

        currentSubsection = null;

        addLine(line);

        continue;
      }

      const subsection =
        detectSubsection(line);

      if (subsection) {
        if (
          currentLines.join("\n").length >
          MAX_CHARS * 0.75
        ) {
          flushChunk();
        }

        currentSubsection =
          subsection;

        addLine(line);

        continue;
      }

      addLine(line);
    }

    // Do not blindly flush at every page.
    // If a section continues over a page break,
    // it remains associated with the same section.
    if (
      currentLines.join("\n").length >
      MAX_CHARS * 0.8
    ) {
      flushChunk();
    }
  }

  flushChunk();

  // Safety fallback for unusually formatted documents.
  if (chunks.length === 0 && rawText.trim()) {
    const paragraphs = rawText
      .split(/\n{2,}/)
      .map((x) => x.trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      for (
        let i = 0;
        i < paragraph.length;
        i += MAX_CHARS
      ) {
        const piece = paragraph
          .slice(i, i + MAX_CHARS)
          .trim();

        if (!piece) continue;

        chunks.push({
          index: chunks.length,
          content: piece,
          section_number: null,
          subsection: null,
          source_locator:
            buildSourceLocator(
              title,
              null,
              null,
              1,
            ),
        });
      }
    }
  }

  return chunks;
}

// -----------------------------------------------------------------------------
// PREVIEW SECTION DETECTION
// -----------------------------------------------------------------------------

function detectSectionsForPreview(
  text: string,
): string[] {
  const result = new Set<string>();

  const pages = splitIntoPages(text);

  for (const page of pages) {
    for (const line of page.text.split("\n")) {
      const detected =
        detectSectionNumber(line);

      if (detected.section) {
        result.add(detected.section);
      }
    }
  }

  return Array.from(result);
}

// -----------------------------------------------------------------------------
// FILE TYPE DETECTION
// -----------------------------------------------------------------------------

function detectContentType(
  contentType: string | null,
  url: string,
): "pdf" | "html" | "text" {
  const type =
    (contentType || "").toLowerCase();

  if (
    type.includes("application/pdf") ||
    /\.pdf(?:$|\?)/i.test(url)
  ) {
    return "pdf";
  }

  if (
    type.includes("text/html") ||
    type.includes("application/xhtml")
  ) {
    return "html";
  }

  return "text";
}

// -----------------------------------------------------------------------------
// DUPLICATE CHECKING
// -----------------------------------------------------------------------------

async function findPossibleDuplicate(
  title: string,
  sourceUrl: string | null,
  versionLabel: string | null,
) {
  if (sourceUrl) {
    const { data } = await supabase
      .from("documents")
      .select(
        "id,title,version_label,current_status,status,source_url",
      )
      .eq("source_url", sourceUrl)
      .limit(10);

    if (data && data.length > 0) {
      const exactVersion =
        data.find(
          (doc: any) =>
            (doc.version_label || null) ===
            (versionLabel || null),
        );

      return {
        exact: exactVersion || null,
        possible: data,
      };
    }
  }

  const { data: titleMatches } =
    await supabase
      .from("documents")
      .select(
        "id,title,version_label,current_status,status,source_url",
      )
      .ilike("title", title)
      .limit(10);

  if (titleMatches && titleMatches.length > 0) {
    const exactVersion =
      titleMatches.find(
        (doc: any) =>
          (doc.version_label || null) ===
          (versionLabel || null),
      );

    return {
      exact: exactVersion || null,
      possible: titleMatches,
    };
  }

  return {
    exact: null,
    possible: [],
  };
}

// -----------------------------------------------------------------------------
// EMBEDDING
// -----------------------------------------------------------------------------

async function createEmbedding(
  text: string,
): Promise<number[]> {
  const model =
    new Supabase.ai.Session("gte-small");

  const result = await model.run(
    text.substring(0, 800),
    {
      mean_pool: true,
      normalize: true,
    },
  );

  const embedding = Array.from(
    result as Iterable<number>,
  ).map(Number);

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch. Expected ${EMBEDDING_DIM}, received ${embedding.length}.`,
    );
  }

  if (
    embedding.some(
      (value) => !Number.isFinite(value),
    )
  ) {
    throw new Error(
      "Embedding contains invalid numeric values.",
    );
  }

  return embedding;
}

// -----------------------------------------------------------------------------
// GET DOCUMENT
// -----------------------------------------------------------------------------

async function getDocument(
  documentId: number,
) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load document: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Document not found.",
    );
  }

  return data;
}

// -----------------------------------------------------------------------------
// INGESTION BATCH
// -----------------------------------------------------------------------------

async function processDocumentBatch(
  documentId: number,
  offset: number,
  batchSize: number,
) {
  const document =
    await getDocument(documentId);

  const rawContent =
    String(document.content || "").trim();

  if (!rawContent) {
    throw new Error(
      "Document has no extracted content.",
    );
  }

  const allChunks =
    chunkLegalContent(
      document.title,
      rawContent,
    );

  if (allChunks.length === 0) {
    throw new Error(
      "No legal chunks could be generated from this document.",
    );
  }

  const safeOffset = Math.max(
    0,
    Math.floor(offset),
  );

  const batch =
    allChunks.slice(
      safeOffset,
      safeOffset + batchSize,
    );

  if (batch.length === 0) {
    const { error } =
      await supabase
        .from("documents")
        .update({
          status: "completed",
          processed_sections:
            allChunks.length,
          total_sections:
            allChunks.length,
          updated_at: new Date().toISOString(),
          error_log: null,
        })
        .eq("id", documentId);

    if (error) {
      throw new Error(
        `Unable to finalize document: ${error.message}`,
      );
    }

    return {
      completed: true,
      offset: safeOffset,
      next_offset: safeOffset,
      batch_processed: 0,
      total_chunks: allChunks.length,
      processed_chunks: allChunks.length,
      failed_chunks: 0,
    };
  }

  const batchLocators =
    batch.map(
      (chunk) => chunk.source_locator,
    );

  /*
   * If the same batch is retried after a partial failure,
   * remove its previous inserts first.
   *
   * This avoids duplicate chunks without requiring
   * another schema migration.
   */
  const { error: cleanupError } =
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId)
      .in(
        "source_locator",
        batchLocators,
      );

  if (cleanupError) {
    throw new Error(
      `Unable to prepare batch for retry: ${cleanupError.message}`,
    );
  }

  let processedInBatch = 0;

  const failures: string[] = [];

  for (const chunk of batch) {
    try {
      const embedding =
        await createEmbedding(
          chunk.content,
        );

      const { error: insertError } =
        await supabase
          .from("knowledge_chunks")
          .insert({
            document_id: documentId,
            content: chunk.content,
            embedding,
            section_number:
              chunk.section_number,
            subsection:
              chunk.subsection,
            source_locator:
              chunk.source_locator,
          });

      if (insertError) {
        throw new Error(
          insertError.message,
        );
      }

      processedInBatch++;
    } catch (err) {
      failures.push(
        `Chunk ${chunk.index}: ${
          err instanceof Error
            ? err.message
            : String(err)
        }`,
      );

      break;
    }
  }

  const newOffset =
    safeOffset + processedInBatch;

  const isComplete =
    failures.length === 0 &&
    newOffset >= allChunks.length;

  const status =
    isComplete
      ? "completed"
      : "processing";

  const errorLog =
    failures.length > 0
      ? failures.join("\n")
      : null;

  const { error: updateError } =
    await supabase
      .from("documents")
      .update({
        status,
        total_sections:
          allChunks.length,
        processed_sections:
          newOffset,
        error_log:
          errorLog,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", documentId);

  if (updateError) {
    throw new Error(
      `Unable to update ingestion progress: ${updateError.message}`,
    );
  }

  return {
    completed: isComplete,
    offset: safeOffset,
    next_offset: newOffset,
    batch_processed:
      processedInBatch,
    total_chunks:
      allChunks.length,
    processed_chunks:
      newOffset,
    failed_chunks:
      failures.length,
    errors:
      failures.length > 0
        ? failures
        : undefined,
  };
}

// -----------------------------------------------------------------------------
// RESET DOCUMENT FOR REINDEX
// -----------------------------------------------------------------------------

async function resetDocumentForIndexing(
  documentId: number,
) {
  const { error: deleteError } =
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

  if (deleteError) {
    throw new Error(
      `Unable to remove existing chunks: ${deleteError.message}`,
    );
  }

  const { error: updateError } =
    await supabase
      .from("documents")
      .update({
        status: "processing",
        processed_sections: 0,
        total_sections: 0,
        error_log: null,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", documentId);

  if (updateError) {
    throw new Error(
      `Unable to reset document: ${updateError.message}`,
    );
  }
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    if (!isAdmin(req)) {
      return errorResponse(
        "Unauthorized.",
        401,
      );
    }

    const url =
      new URL(req.url);

    const pathname =
      url.pathname.replace(
        /^\/+/,
        "",
      );

    const segments =
      pathname
        .split("/")
        .filter(Boolean);

    /*
     * Depending on Supabase's function URL,
     * pathname may begin with:
     *
     * admin/...
     *
     * or simply:
     *
     * ...
     *
     * We normalize both.
     */
    if (
      segments[0] === "admin"
    ) {
      segments.shift();
    }

    // -----------------------------------------------------------------------
    // SETTINGS
    // -----------------------------------------------------------------------

    if (
      segments[0] === "settings" &&
      req.method === "GET"
    ) {
      const { data, error } =
        await supabase
          .from("settings")
          .select("*")
          .limit(1)
          .maybeSingle();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(data);
    }

    if (
      segments[0] === "settings" &&
      req.method === "PATCH"
    ) {
      const body =
        await req.json();

      const update: Record<
        string,
        unknown
      > = {
        updated_at:
          new Date().toISOString(),
      };

      if (
        typeof body.api_enabled ===
        "boolean"
      ) {
        update.api_enabled =
          body.api_enabled;
      }

      if (
        typeof body.active_model ===
        "string"
      ) {
        update.active_model =
          body.active_model.trim();
      }

      const { data, error } =
        await supabase
          .from("settings")
          .update(update)
          .not("id", "is", null)
          .select("*")
          .maybeSingle();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "Settings updated.",
      );
    }

    // -----------------------------------------------------------------------
    // API KEYS
    // -----------------------------------------------------------------------

    if (
      segments[0] === "keys" &&
      req.method === "GET"
    ) {
      const { data, error } =
        await supabase
          .from("api_keys")
          .select(
            "id,key,site,status,created_at",
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          );

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(data);
    }

    if (
      segments[0] === "keys" &&
      req.method === "POST"
    ) {
      const body =
        await req.json();

      const key =
        cleanString(body.key);

      const site =
        cleanString(body.site);

      if (!key) {
        return errorResponse(
          "API key is required.",
        );
      }

      const { data, error } =
        await supabase
          .from("api_keys")
          .insert({
            key,
            site,
            status:
              cleanString(body.status) ||
              "active",
          })
          .select(
            "id,key,site,status,created_at",
          )
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "API key added.",
      );
    }

    if (
      segments[0] === "keys" &&
      segments[1] &&
      req.method === "DELETE"
    ) {
      const id =
        segments[1];

      const { error } =
        await supabase
          .from("api_keys")
          .update({
            status: "revoked",
          })
          .eq("id", id);

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        null,
        "API key revoked.",
      );
    }

    // -----------------------------------------------------------------------
    // DOCUMENT LIST
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      !segments[1] &&
      req.method === "GET"
    ) {
      const { data, error } =
        await supabase
          .from("documents")
          .select(
            `
              id,
              title,
              jurisdiction,
              document_type,
              status,
              total_sections,
              processed_sections,
              error_log,
              created_at,
              updated_at,
              authority_level,
              official_source,
              source_url,
              effective_from,
              effective_to,
              current_status,
              last_verified_at,
              verification_source,
              version_label
            `,
          )
          .order(
            "updated_at",
            {
              ascending: false,
            },
          );

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(data);
    }

    // -----------------------------------------------------------------------
    // CREATE DOCUMENT FROM PASTED TEXT
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      !segments[1] &&
      req.method === "POST"
    ) {
      const body =
        await req.json();

      const title =
        cleanString(body.title);

      const content =
        cleanString(body.content);

      if (!title) {
        return errorResponse(
          "Document title is required.",
        );
      }

      if (!content) {
        return errorResponse(
          "Document content is required.",
        );
      }

      const jurisdiction =
        normalizeJurisdiction(
          body.jurisdiction,
        );

      const documentType =
        normalizeDocumentType(
          body.document_type,
        );

      const authorityLevel =
        normalizeAuthorityLevel(
          body.authority_level,
        );

      const currentStatus =
        normalizeCurrentStatus(
          body.current_status,
        );

      const versionLabel =
        cleanString(
          body.version_label,
        );

      const sourceUrl =
        cleanString(
          body.source_url,
        );

      const duplicate =
        await findPossibleDuplicate(
          title,
          sourceUrl,
          versionLabel,
        );

      if (duplicate.exact) {
        return errorResponse(
          "A document with the same title/source/version already exists.",
          409,
          {
            duplicate:
              duplicate.exact,
            possible_matches:
              duplicate.possible,
          },
        );
      }

      const { data, error } =
        await supabase
          .from("documents")
          .insert({
            title,
            content,
            jurisdiction,
            document_type:
              documentType,
            status: "pending",
            authority_level:
              authorityLevel,
            official_source:
              cleanString(
                body.official_source,
              ),
            source_url:
              sourceUrl,
            effective_from:
              cleanString(
                body.effective_from,
              ),
            effective_to:
              cleanString(
                body.effective_to,
              ),
            current_status:
              currentStatus,
            verification_source:
              cleanString(
                body.verification_source,
              ),
            version_label:
              versionLabel,
          })
          .select("*")
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "Document created and is awaiting preview/indexing.",
        201,
      );
    }

    // -----------------------------------------------------------------------
    // IMPORT DOCUMENT FROM URL
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] === "import-url" &&
      req.method === "POST"
    ) {
      const body =
        await req.json();

      const suppliedUrl =
        cleanString(body.url);

      if (!suppliedUrl) {
        return errorResponse(
          "URL is required.",
        );
      }

      let validatedUrl: URL;

      try {
        validatedUrl =
          validateRemoteUrl(
            suppliedUrl,
          );
      } catch (err) {
        return errorResponse(
          err instanceof Error
            ? err.message
            : "Invalid URL.",
        );
      }

      try {
        const {
          response,
          finalUrl,
        } =
          await fetchRemoteResource(
            validatedUrl.toString(),
          );

        if (!response.ok) {
          return errorResponse(
            `Remote server returned HTTP ${response.status}.`,
            400,
          );
        }

        const contentType =
          response.headers.get(
            "content-type",
          );

        const detectedType =
          detectContentType(
            contentType,
            finalUrl,
          );

        const buffer =
          await readResponseWithLimit(
            response,
            MAX_DOWNLOAD_SIZE,
          );

        let content = "";
        let pages = 0;
        let hasPageBreaks = false;

        if (detectedType === "pdf") {
          const extracted =
            await extractPdfText(
              buffer,
            );

          content =
            extracted.text;

          pages =
            extracted.pages;

          hasPageBreaks =
            extracted.hasPageBreaks;
        } else {
          const text =
            new TextDecoder()
              .decode(buffer);

          content =
            detectedType === "html"
              ? extractHtmlText(text)
              : text
                  .replace(
                    /\r\n/g,
                    "\n",
                  )
                  .replace(
                    /\r/g,
                    "\n",
                  )
                  .trim();
        }

        if (!content.trim()) {
          return errorResponse(
            "The imported resource contains no usable text.",
            400,
          );
        }

        const title =
          cleanString(
            body.title,
          ) ||
          new URL(finalUrl)
            .hostname
            .replace(/^www\./, "");

        const jurisdiction =
          normalizeJurisdiction(
            body.jurisdiction,
          );

        const documentType =
          normalizeDocumentType(
            body.document_type,
          );

        const authorityLevel =
          normalizeAuthorityLevel(
            body.authority_level,
          );

        const currentStatus =
          normalizeCurrentStatus(
            body.current_status,
          );

        const versionLabel =
          cleanString(
            body.version_label,
          );

        const duplicate =
          await findPossibleDuplicate(
            title,
            finalUrl,
            versionLabel,
          );

        if (duplicate.exact) {
          return errorResponse(
            "This document/version already exists.",
            409,
            {
              duplicate:
                duplicate.exact,
              possible_matches:
                duplicate.possible,
            },
          );
        }

        const { data, error } =
          await supabase
            .from("documents")
            .insert({
              title,
              content,
              jurisdiction,
              document_type:
                documentType,
              status: "pending",
              authority_level:
                authorityLevel,
              official_source:
                cleanString(
                  body.official_source,
                ) ||
                new URL(finalUrl).hostname,
              source_url:
                finalUrl,
              effective_from:
                cleanString(
                  body.effective_from,
                ),
              effective_to:
                cleanString(
                  body.effective_to,
                ),
              current_status:
                currentStatus,
              verification_source:
                cleanString(
                  body.verification_source,
                ),
              version_label:
                versionLabel,
            })
            .select("*")
            .single();

        if (error) {
          return errorResponse(
            error.message,
            500,
          );
        }

        const sections =
          detectSectionsForPreview(
            content,
          );

        return success(
          {
            document: data,
            extraction: {
              type: detectedType,
              final_url:
                finalUrl,
              characters:
                content.length,
              pages,
              has_page_breaks:
                hasPageBreaks,
              sections_detected:
                sections.length,
              sections,
              warning:
                detectedType ===
                  "pdf" &&
                !hasPageBreaks
                  ? "PDF text was extracted, but reliable page boundaries were not available. Section locators will be used without guaranteed page numbers."
                  : null,
            },
          },
          "Document imported successfully. Review the preview before indexing.",
          201,
        );
      } catch (err) {
        return errorResponse(
          err instanceof Error
            ? err.message
            : String(err),
          400,
        );
      }
    }

    // -----------------------------------------------------------------------
    // UPLOAD FILE
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] === "upload" &&
      req.method === "POST"
    ) {
      const form =
        await req.formData();

      const file =
        form.get("file");

      if (!(file instanceof File)) {
        return errorResponse(
          "A file is required.",
        );
      }

      if (
        file.size >
        MAX_UPLOAD_SIZE
      ) {
        return errorResponse(
          `File exceeds the ${Math.round(
            MAX_UPLOAD_SIZE / 1024 / 1024,
          )}MB limit.`,
        );
      }

      const originalName =
        file.name || "uploaded-document";

      const extension =
        originalName
          .split(".")
          .pop()
          ?.toLowerCase() || "";

      const blockedExtensions = [
        "exe",
        "dll",
        "bat",
        "cmd",
        "com",
        "msi",
        "sh",
        "ps1",
        "js",
        "ts",
        "php",
        "py",
        "jar",
        "apk",
        "aab",
        "zip",
        "rar",
        "7z",
      ];

      if (
        blockedExtensions.includes(
          extension,
        )
      ) {
        return errorResponse(
          "This file type is not permitted.",
        );
      }

      const arrayBuffer =
        await file.arrayBuffer();

      const bytes =
        new Uint8Array(
          arrayBuffer,
        );

      let extractedText = "";

      let detectedType:
        | "pdf"
        | "html"
        | "text";

      let pages = 0;

      let hasPageBreaks = false;

      if (
        extension === "pdf" ||
        file.type ===
          "application/pdf"
      ) {
        detectedType = "pdf";

        const extracted =
          await extractPdfText(
            bytes,
          );

        extractedText =
          extracted.text;

        pages =
          extracted.pages;

        hasPageBreaks =
          extracted.hasPageBreaks;
      } else {
        const raw =
          new TextDecoder().decode(
            bytes,
          );

        if (
          file.type.includes(
            "html",
          ) ||
          extension === "html" ||
          extension === "htm"
        ) {
          detectedType = "html";

          extractedText =
            extractHtmlText(raw);
        } else {
          detectedType = "text";

          extractedText =
            raw
              .replace(
                /\r\n/g,
                "\n",
              )
              .replace(
                /\r/g,
                "\n",
              )
              .trim();
        }
      }

      if (!extractedText.trim()) {
        return errorResponse(
          "No usable text could be extracted from this file. If it is a scanned PDF, OCR is required.",
        );
      }

      const title =
        cleanString(
          form.get("title"),
        ) ||
        originalName.replace(
          /\.[^.]+$/,
          "",
        );

      const jurisdiction =
        normalizeJurisdiction(
          form.get(
            "jurisdiction",
          ),
        );

      const documentType =
        normalizeDocumentType(
          form.get(
            "document_type",
          ),
        );

      const authorityLevel =
        normalizeAuthorityLevel(
          form.get(
            "authority_level",
          ),
        );

      const currentStatus =
        normalizeCurrentStatus(
          form.get(
            "current_status",
          ),
        );

      const versionLabel =
        cleanString(
          form.get(
            "version_label",
          ),
        );

      const sourceUrl =
        cleanString(
          form.get(
            "source_url",
          ),
        );

      const duplicate =
        await findPossibleDuplicate(
          title,
          sourceUrl,
          versionLabel,
        );

      if (duplicate.exact) {
        return errorResponse(
          "This document/version already exists.",
          409,
          {
            duplicate:
              duplicate.exact,
            possible_matches:
              duplicate.possible,
          },
        );
      }

      const { data, error } =
        await supabase
          .from("documents")
          .insert({
            title,
            content:
              extractedText,
            jurisdiction,
            document_type:
              documentType,
            status: "pending",
            authority_level:
              authorityLevel,
            official_source:
              cleanString(
                form.get(
                  "official_source",
                ),
              ),
            source_url:
              sourceUrl,
            effective_from:
              cleanString(
                form.get(
                  "effective_from",
                ),
              ),
            effective_to:
              cleanString(
                form.get(
                  "effective_to",
                ),
              ),
            current_status:
              currentStatus,
            verification_source:
              cleanString(
                form.get(
                  "verification_source",
                ),
              ),
            version_label:
              versionLabel,
          })
          .select("*")
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      const sections =
        detectSectionsForPreview(
          extractedText,
        );

      return success(
        {
          document: data,
          extraction: {
            filename:
              originalName,
            type:
              detectedType,
            characters:
              extractedText.length,
            pages,
            has_page_breaks:
              hasPageBreaks,
            sections_detected:
              sections.length,
            sections,
            warning:
              detectedType ===
                "pdf" &&
              !hasPageBreaks
                ? "PDF page boundaries could not be reliably recovered."
                : null,
          },
        },
        "File uploaded successfully. Review the preview before indexing.",
        201,
      );
    }

    // -----------------------------------------------------------------------
    // DOCUMENT PREVIEW
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      segments[2] === "preview" &&
      req.method === "GET"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const document =
        await getDocument(
          documentId,
        );

      const content =
        String(
          document.content || "",
        );

      const chunks =
        chunkLegalContent(
          document.title,
          content,
        );

      const sections =
        detectSectionsForPreview(
          content,
        );

      const previewChunks =
        chunks
          .slice(0, 10)
          .map((chunk) => ({
            index: chunk.index,
            section_number:
              chunk.section_number,
            subsection:
              chunk.subsection,
            source_locator:
              chunk.source_locator,
            content:
              chunk.content.substring(
                0,
                600,
              ),
          }));

      const pages =
        splitIntoPages(content);

      return success({
        document: {
          ...document,
          /*
           * Avoid duplicating huge content accidentally.
           * Full content is still returned explicitly below
           * because this is an admin-only endpoint.
           */
          full_content:
            content,
        },
        analysis: {
          characters:
            content.length,
          pages_detected:
            pages.length,
          sections_detected:
            sections.length,
          sections,
          planned_chunks:
            chunks.length,
          chunk_previews:
            previewChunks,
        },
      });
    }

    // -----------------------------------------------------------------------
    // INDEX DOCUMENT - CONTROLLED BATCH
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      segments[2] === "index" &&
      req.method === "POST"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const document =
        await getDocument(
          documentId,
        );

      if (
        document.status ===
          "rejected"
      ) {
        return errorResponse(
          "Rejected documents cannot be indexed.",
          409,
        );
      }

      const body =
        req.headers
          .get("content-type")
          ?.includes(
            "application/json",
          )
          ? await req.json()
          : {};

      const batchSize =
        clampBatchSize(
          body?.batch_size ??
            url.searchParams.get(
              "batch_size",
            ),
        );

      const requestedOffsetRaw =
        body?.offset ??
        url.searchParams.get(
          "offset",
        );

      const requestedOffset =
        requestedOffsetRaw ===
        undefined ||
        requestedOffsetRaw ===
          null ||
        requestedOffsetRaw === ""
          ? Number(
              document.processed_sections ||
                0,
            )
          : Number(
              requestedOffsetRaw,
            );

      if (
        !Number.isInteger(
          requestedOffset,
        ) ||
        requestedOffset < 0
      ) {
        return errorResponse(
          "Invalid indexing offset.",
        );
      }

      const reset =
        body?.reset === true ||
        url.searchParams.get(
          "reset",
        ) === "true";

      let offset =
        requestedOffset;

      if (reset) {
        await resetDocumentForIndexing(
          documentId,
        );

        offset = 0;
      } else if (
        document.status ===
        "pending"
      ) {
        /*
         * First normal indexing call.
         */
        await supabase
          .from("documents")
          .update({
            status: "processing",
            error_log: null,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", documentId);
      }

      const result =
        await processDocumentBatch(
          documentId,
          offset,
          batchSize,
        );

      return success(
        {
          document_id:
            documentId,
          ...result,
          next_request:
            result.completed
              ? null
              : {
                  method: "POST",
                  endpoint:
                    `/documents/${documentId}/index`,
                  offset:
                    result.next_offset,
                  batch_size:
                    batchSize,
                },
        },
        result.completed
          ? "Document indexing completed."
          : "Indexing batch completed. Continue with the next batch.",
        result.completed
          ? 200
          : 202,
      );
    }

    // -----------------------------------------------------------------------
    // REINDEX DOCUMENT
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      segments[2] === "reindex" &&
      req.method === "POST"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const document =
        await getDocument(
          documentId,
        );

      if (
        document.status ===
          "rejected"
      ) {
        return errorResponse(
          "Rejected documents cannot be reindexed.",
          409,
        );
      }

      await resetDocumentForIndexing(
        documentId,
      );

      const batchSize =
        clampBatchSize(
          url.searchParams.get(
            "batch_size",
          ),
        );

      const result =
        await processDocumentBatch(
          documentId,
          0,
          batchSize,
        );

      return success(
        {
          document_id:
            documentId,
          ...result,
          next_request:
            result.completed
              ? null
              : {
                  method: "POST",
                  endpoint:
                    `/documents/${documentId}/index`,
                  offset:
                    result.next_offset,
                  batch_size:
                    batchSize,
                },
        },
        result.completed
          ? "Document reindexed successfully."
          : "Document reindex started. Continue with the next batch.",
        result.completed
          ? 200
          : 202,
      );
    }

    // -----------------------------------------------------------------------
    // VERIFY / UPDATE LEGAL STATUS
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      segments[2] === "verification" &&
      req.method === "PATCH"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const body =
        await req.json();

      const currentStatus =
        normalizeCurrentStatus(
          body.current_status,
        );

      const update = {
        current_status:
          currentStatus,
        official_source:
          cleanString(
            body.official_source,
          ),
        source_url:
          cleanString(
            body.source_url,
          ),
        effective_from:
          cleanString(
            body.effective_from,
          ),
        effective_to:
          cleanString(
            body.effective_to,
          ),
        verification_source:
          cleanString(
            body.verification_source,
          ),
        last_verified_at:
          body.last_verified_at ||
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      };

      const { data, error } =
        await supabase
          .from("documents")
          .update(update)
          .eq("id", documentId)
          .select("*")
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "Legal verification metadata updated.",
      );
    }

    // -----------------------------------------------------------------------
    // REJECT DOCUMENT
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      segments[2] === "reject" &&
      req.method === "PATCH"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const body =
        await req.json().catch(
          () => ({}),
        );

      const reason =
        cleanString(
          body.reason,
        ) ||
        "Document rejected by administrator.";

      /*
       * Remove chunks first.
       */
      const { error: chunkError } =
        await supabase
          .from("knowledge_chunks")
          .delete()
          .eq("document_id", documentId);

      if (chunkError) {
        return errorResponse(
          chunkError.message,
          500,
        );
      }

      const { data, error } =
        await supabase
          .from("documents")
          .update({
            status: "rejected",
            error_log: reason,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", documentId)
          .select("*")
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "Document rejected.",
      );
    }

    // -----------------------------------------------------------------------
    // DELETE DOCUMENT
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      req.method === "DELETE"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      /*
       * Delete child chunks first.
       *
       * This avoids relying on an unknown ON DELETE CASCADE
       * configuration.
       */
      const {
        error: chunkError,
      } = await supabase
        .from("knowledge_chunks")
        .delete()
        .eq("document_id", documentId);

      if (chunkError) {
        return errorResponse(
          `Unable to delete document chunks: ${chunkError.message}`,
          500,
        );
      }

      const {
        error: documentError,
      } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (documentError) {
        return errorResponse(
          `Chunks were removed but document deletion failed: ${documentError.message}`,
          500,
        );
      }

      return success(
        null,
        "Document and its indexed chunks deleted.",
      );
    }

    // -----------------------------------------------------------------------
    // DOCUMENT STATUS UPDATE
    // -----------------------------------------------------------------------

    if (
      segments[0] === "documents" &&
      segments[1] &&
      req.method === "PATCH"
    ) {
      const documentId =
        Number(segments[1]);

      if (
        !Number.isInteger(
          documentId,
        )
      ) {
        return errorResponse(
          "Invalid document ID.",
        );
      }

      const body =
        await req.json();

      const update: Record<
        string,
        unknown
      > = {
        updated_at:
          new Date().toISOString(),
      };

      if (
        body.title !== undefined
      ) {
        const title =
          cleanString(
            body.title,
          );

        if (!title) {
          return errorResponse(
            "Title cannot be empty.",
          );
        }

        update.title = title;
      }

      if (
        body.jurisdiction !==
        undefined
      ) {
        update.jurisdiction =
          normalizeJurisdiction(
            body.jurisdiction,
          );
      }

      if (
        body.document_type !==
        undefined
      ) {
        update.document_type =
          normalizeDocumentType(
            body.document_type,
          );
      }

      if (
        body.authority_level !==
        undefined
      ) {
        update.authority_level =
          normalizeAuthorityLevel(
            body.authority_level,
          );
      }

      if (
        body.current_status !==
        undefined
      ) {
        update.current_status =
          normalizeCurrentStatus(
            body.current_status,
          );
      }

      if (
        body.official_source !==
        undefined
      ) {
        update.official_source =
          cleanString(
            body.official_source,
          );
      }

      if (
        body.source_url !==
        undefined
      ) {
        update.source_url =
          cleanString(
            body.source_url,
          );
      }

      if (
        body.effective_from !==
        undefined
      ) {
        update.effective_from =
          cleanString(
            body.effective_from,
          );
      }

      if (
        body.effective_to !==
        undefined
      ) {
        update.effective_to =
          cleanString(
            body.effective_to,
          );
      }

      if (
        body.version_label !==
        undefined
      ) {
        update.version_label =
          cleanString(
            body.version_label,
          );
      }

      if (
        body.verification_source !==
        undefined
      ) {
        update.verification_source =
          cleanString(
            body.verification_source,
          );
      }

      if (
        body.status !==
        undefined
      ) {
        const status =
          normalizeIngestionStatus(
            body.status,
          );

        update.status =
          status;
      }

      const { data, error } =
        await supabase
          .from("documents")
          .update(update)
          .eq("id", documentId)
          .select("*")
          .single();

      if (error) {
        return errorResponse(
          error.message,
          500,
        );
      }

      return success(
        data,
        "Document updated.",
      );
    }

    // -----------------------------------------------------------------------
    // 404
    // -----------------------------------------------------------------------

    return errorResponse(
      "Admin endpoint not found.",
      404,
    );
  } catch (err) {
    console.error(
      "LexAI Admin Error:",
      err,
    );

    return errorResponse(
      err instanceof Error
        ? err.message
        : String(err),
      500,
    );
  }
});
