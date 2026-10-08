import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import pdfParse from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods":
    "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_TEXT_LENGTH = 10_000_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_URL_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const INDEX_BATCH_SIZE = 8;
const MAX_CHUNK_CHARS = 1800;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

type Json = Record<string, unknown>;

function json(
  body: Json,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function success<T>(
  data: T,
  message?: string,
): Response {
  return json({
    success: true,
    data,
    ...(message ? { message } : {}),
  });
}

function failure(
  error: string,
  status = 400,
  details?: unknown,
): Response {
  return json({
    success: false,
    error,
    ...(details !== undefined ? { details } : {}),
  }, status);
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function normalizeJurisdiction(value: unknown): string {
  const v = String(value ?? "nigeria").trim().toLowerCase();

  if (v === "ng" || v === "nigeria") return "nigeria";
  if (v === "us" || v === "usa" || v === "united states") return "us";
  if (v === "global") return "global";

  return v || "nigeria";
}

function normalizeDocumentType(value: unknown): string {
  const allowed = new Set([
    "constitution",
    "statute",
    "amendment",
    "case",
    "judgment",
    "regulation",
    "rule",
    "legal_guidance",
    "orientation",
    "principle",
  ]);

  const v = String(value ?? "statute").trim().toLowerCase();

  return allowed.has(v) ? v : "statute";
}

function normalizeAuthority(value: unknown): string {
  const allowed = new Set([
    "primary",
    "secondary",
    "orientation",
  ]);

  const v = String(value ?? "primary").trim().toLowerCase();

  return allowed.has(v) ? v : "primary";
}

function normalizeCurrentStatus(value: unknown): string {
  const allowed = new Set([
    "verified",
    "partially_verified",
    "unverified",
    "repealed",
    "superseded",
    "amended",
    "pending_review",
  ]);

  const v = String(value ?? "unverified").trim().toLowerCase();

  return allowed.has(v) ? v : "unverified";
}

function validateDate(value: unknown): string | null {
  if (!value) return null;

  const v = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`Invalid date: ${v}`);
  }

  return v;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();

  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("html")) return "html";
  if (ct.includes("text")) return "txt";

  return "";
}

function looksLikePrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  if (looksLikePrivateIPv4(host)) return true;

  if (
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }

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

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  if (isPrivateHostname(url.hostname)) {
    throw new Error("Private or local network URLs are not allowed.");
  }

  const host = url.hostname.toLowerCase();

  if (
    host.includes("supabase.co") ||
    host.includes("supabase.com") ||
    host.includes("supabase.net")
  ) {
    throw new Error("Supabase URLs are not allowed for document import.");
  }

  return url;
}

async function fetchExternalDocument(rawUrl: string) {
  let current = validateExternalUrl(rawUrl);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 30_000);

    let response: Response;

    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "LexAI-LegalResearchBot/1.0",
          "Accept":
            "application/pdf,text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
      });
    } catch (error) {
      throw new Error(
        `Unable to fetch URL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === MAX_REDIRECTS) {
        throw new Error("Too many redirects.");
      }

      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Redirect response has no location.");
      }

      current = validateExternalUrl(
        new URL(location, current).toString(),
      );

      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Source returned HTTP ${response.status}.`,
      );
    }

    const contentLength = Number(
      response.headers.get("content-length") ?? "0",
    );

    if (contentLength > MAX_URL_BYTES) {
      throw new Error("Remote document is too large.");
    }

    const buffer = new Uint8Array(await response.arrayBuffer());

    if (buffer.byteLength > MAX_URL_BYTES) {
      throw new Error("Remote document is too large.");
    }

    const contentType =
      response.headers.get("content-type") ?? "";

    return {
      url: current.toString(),
      contentType,
      bytes: buffer,
    };
  }

  throw new Error("Unable to fetch document.");
}

async function extractDocument(
  bytes: Uint8Array,
  contentType: string,
  filename = "",
) {
  const lowerName = filename.toLowerCase();

  const isPdf =
    contentType.toLowerCase().includes("pdf") ||
    lowerName.endsWith(".pdf") ||
    new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";

  if (isPdf) {
    const parsed = await pdfParse(bytes);

    const text = normalizeText(parsed.text);

    if (text.length < 20) {
      throw new Error(
        "The PDF contains little or no extractable text. It may be scanned/image-only and requires OCR before ingestion.",
      );
    }

    return {
      content: text,
      pages: Number(parsed.numpages || 0),
      format: "pdf",
    };
  }

  const raw = new TextDecoder("utf-8").decode(bytes);

  const isHtml =
    contentType.toLowerCase().includes("html") ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm");

  const text = normalizeText(
    isHtml ? cleanHtml(raw) : raw,
  );

  if (text.length < 20) {
    throw new Error(
      "The imported document does not contain enough readable text.",
    );
  }

  return {
    content: text,
    pages: 0,
    format: isHtml ? "html" : "text",
  };
}

interface Chunk {
  index: number;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
  content: string;
}

function splitLongText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const output: string[] = [];

  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf("\n", maxChars);

    if (cut < Math.floor(maxChars * 0.55)) {
      cut = remaining.lastIndexOf(". ", maxChars);
    }

    if (cut < Math.floor(maxChars * 0.55)) {
      cut = remaining.lastIndexOf(" ", maxChars);
    }

    if (cut <= 0) {
      cut = maxChars;
    }

    output.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    output.push(remaining);
  }

  return output;
}

function buildChunks(
  content: string,
  title: string,
): Chunk[] {
  const normalized = normalizeText(content);

  if (!normalized) return [];

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];

  let current: string[] = [];
  let currentSection: string | null = null;
  let currentSubsection: string | null = null;

  function flush() {
    if (!current.length) return;

    const text = current.join("\n").trim();

    if (!text) {
      current = [];
      return;
    }

    const pieces = splitLongText(text);

    for (const piece of pieces) {
      const index = chunks.length;

      chunks.push({
        index,
        section_number: currentSection,
        subsection: currentSubsection,
        source_locator: [
          title,
          currentSection
            ? `Section ${currentSection}`
            : null,
          currentSubsection
            ? `Subsection ${currentSubsection}`
            : null,
        ]
          .filter(Boolean)
          .join(" > "),
        content: piece,
      });
    }

    current = [];
  }

  for (const line of lines) {
    const sectionMatch =
      line.match(
        /^(?:section|sec\.|s\.)\s*([0-9]+[A-Za-z]?(?:\([0-9A-Za-z]+\))?)/i,
      );

    const articleMatch =
      line.match(
        /^(?:article|art\.)\s*([0-9]+[A-Za-z]?)/i,
      );

    const numericHeading =
      line.match(/^([0-9]{1,3})\.\s+([A-Z][^.!?]{2,120})$/);

    const subsectionMatch =
      line.match(/^\(([0-9]+|[a-z])\)\s*/i);

    if (sectionMatch) {
      flush();

      currentSection = sectionMatch[1];
      currentSubsection = null;
      current.push(line);

      continue;
    }

    if (articleMatch) {
      flush();

      currentSection = `Article ${articleMatch[1]}`;
      currentSubsection = null;
      current.push(line);

      continue;
    }

    if (numericHeading && !subsectionMatch) {
      flush();

      currentSection = numericHeading[1];
      currentSubsection = null;
      current.push(line);

      continue;
    }

    if (subsectionMatch && currentSection) {
      const subsection = subsectionMatch[1];

      if (
        current.length &&
        currentSubsection &&
        subsection !== currentSubsection
      ) {
        flush();
      }

      currentSubsection = subsection;
      current.push(line);

      continue;
    }

    current.push(line);

    if (current.join("\n").length >= MAX_CHUNK_CHARS) {
      flush();
    }
  }

  flush();

  return chunks;
}

async function createEmbedding(text: string): Promise<number[]> {
  const session = new Supabase.ai.Session("gte-small");

  const output = await session.run(
    text.slice(0, 6000),
    {
      mean_pool: true,
      normalize: true,
    },
  );

  const embedding = Array.from(output as Iterable<number>);

  if (embedding.length !== 384) {
    throw new Error(
      `Embedding dimension mismatch. Expected 384, received ${embedding.length}.`,
    );
  }

  return embedding;
}

function documentSelect() {
  return [
    "id",
    "title",
    "jurisdiction",
    "document_type",
    "status",
    "total_sections",
    "processed_sections",
    "error_log",
    "created_at",
    "updated_at",
    "authority_level",
    "official_source",
    "source_url",
    "effective_from",
    "effective_to",
    "current_status",
    "last_verified_at",
    "verification_source",
    "version_label",
  ].join(",");
}

async function authenticate(req: Request): Promise<boolean> {
  const supplied = req.headers.get("x-admin-key");
  const expected = Deno.env.get("ADMIN_KEY");

  if (!expected) {
    throw new Error(
      "ADMIN_KEY is not configured in Supabase secrets.",
    );
  }

  return Boolean(supplied && supplied === expected);
}

async function getDocument(id: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Document not found.");
  }

  return data;
}

async function createDocument(input: {
  title: string;
  content: string;
  jurisdiction?: unknown;
  document_type?: unknown;
  authority_level?: unknown;
  official_source?: unknown;
  source_url?: unknown;
  effective_from?: unknown;
  effective_to?: unknown;
  current_status?: unknown;
  verification_source?: unknown;
  version_label?: unknown;
}) {
  const content = normalizeText(input.content);

  if (content.length < 20) {
    throw new Error(
      "Document content is too short.",
    );
  }

  if (content.length > MAX_TEXT_LENGTH) {
    throw new Error(
      "Document content exceeds the maximum allowed size.",
    );
  }

  const title = normalizeText(input.title);

  if (!title) {
    throw new Error("Document title is required.");
  }

  const sourceUrl =
    input.source_url
      ? String(input.source_url).trim()
      : null;

  if (sourceUrl) {
    validateExternalUrl(sourceUrl);
  }

  const versionLabel =
    input.version_label
      ? String(input.version_label).trim()
      : null;

  if (sourceUrl) {
    const { data: sameUrl } = await supabase
      .from("documents")
      .select("id,title,status,version_label")
      .eq("source_url", sourceUrl)
      .limit(1)
      .maybeSingle();

    if (sameUrl) {
      throw new Error(
        `A document with this source URL already exists (document ${sameUrl.id}).`,
      );
    }
  }

  if (versionLabel) {
    const { data: sameVersion } = await supabase
      .from("documents")
      .select("id,title,status,version_label")
      .eq("title", title)
      .eq("version_label", versionLabel)
      .limit(1)
      .maybeSingle();

    if (sameVersion) {
      throw new Error(
        `A document with this title and version already exists (document ${sameVersion.id}).`,
      );
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      jurisdiction: normalizeJurisdiction(
        input.jurisdiction,
      ),
      document_type: normalizeDocumentType(
        input.document_type,
      ),
      content,
      status: "pending",
      total_sections: 0,
      processed_sections: 0,
      error_log: null,
      authority_level: normalizeAuthority(
        input.authority_level,
      ),
      official_source:
        input.official_source
          ? String(input.official_source).trim()
          : null,
      source_url: sourceUrl,
      effective_from: validateDate(
        input.effective_from,
      ),
      effective_to: validateDate(
        input.effective_to,
      ),
      current_status: normalizeCurrentStatus(
        input.current_status,
      ),
      verification_source:
        input.verification_source
          ? String(input.verification_source).trim()
          : null,
      version_label: versionLabel,
    })
    .select(documentSelect())
    .single();

  if (error) throw error;

  return data;
}

async function indexDocumentBatch(
  documentId: string,
  requestedOffset: number,
  requestedBatchSize: number,
  reset: boolean,
) {
  const document = await getDocument(documentId);

  let offset = Math.max(
    0,
    Number.isFinite(requestedOffset)
      ? requestedOffset
      : 0,
  );

  const batchSize = Math.min(
    Math.max(
      1,
      Number.isFinite(requestedBatchSize)
        ? requestedBatchSize
        : INDEX_BATCH_SIZE,
    ),
    INDEX_BATCH_SIZE,
  );

  const chunks = buildChunks(
    document.content,
    document.title,
  );

  if (!chunks.length) {
    throw new Error(
      "No indexable chunks could be created from this document.",
    );
  }

  if (reset) {
    const { error: deleteError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) throw deleteError;

    offset = 0;

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
  }

  if (offset > chunks.length) {
    offset = chunks.length;
  }

  await supabase
    .from("documents")
    .update({
      status: "processing",
      total_sections: chunks.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  const selected = chunks.slice(
    offset,
    offset + batchSize,
  );

  const inserted: unknown[] = [];

  try {
    for (const chunk of selected) {
      const embedding = await createEmbedding(
        chunk.content,
      );

      const { data, error } = await supabase
        .from("knowledge_chunks")
        .insert({
          document_id: documentId,
          content: chunk.content,
          embedding,
          section_number: chunk.section_number,
          subsection: chunk.subsection,
          source_locator: chunk.source_locator,
        })
        .select("id")
        .single();

      if (error) throw error;

      inserted.push(data);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await supabase
      .from("documents")
      .update({
        status: "failed",
        error_log: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    throw new Error(
      `Indexing failed at chunk ${offset}: ${message}`,
    );
  }

  const nextOffset = offset + selected.length;
  const completed = nextOffset >= chunks.length;

  await supabase
    .from("documents")
    .update({
      status: completed ? "completed" : "processing",
      total_sections: chunks.length,
      processed_sections: nextOffset,
      error_log: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return {
    document_id: documentId,
    processed: selected.length,
    inserted: inserted.length,
    offset,
    next_offset: nextOffset,
    total_sections: chunks.length,
    completed,
    status: completed ? "completed" : "processing",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const authenticated = await authenticate(req);

    if (!authenticated) {
      return failure(
        "Forbidden: Invalid Admin Key",
        403,
      );
    }

    const url = new URL(req.url);

    /*
     * Works with:
     * /functions/v1/admin/settings
     * /functions/v1/admin/documents
     * /api/admin/... when proxied by Netlify
     */
    const pathParts = url.pathname
      .split("/")
      .filter(Boolean);

    const adminIndex = pathParts.lastIndexOf("admin");

    const path =
      adminIndex >= 0
        ? pathParts.slice(adminIndex + 1).join("/")
        : "";

    const method = req.method.toUpperCase();

    // ---------------------------------------------------------
    // SETTINGS
    // ---------------------------------------------------------

    if (
      method === "GET" &&
      (path === "" || path === "settings")
    ) {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return success(data);
    }

    if (
      method === "PATCH" &&
      path === "settings"
    ) {
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

      if (!Object.keys(allowed).length) {
        return failure(
          "No supported settings were supplied.",
        );
      }

      allowed.updated_at =
        new Date().toISOString();

      const { data, error } = await supabase
        .from("settings")
        .update(allowed)
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return success(data, "Settings updated.");
    }

    // ---------------------------------------------------------
    // API KEYS
    // ---------------------------------------------------------

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

      return success(data ?? []);
    }

    if (
      method === "POST" &&
      path === "keys"
    ) {
      const body = await req.json();

      const site =
        typeof body.site === "string"
          ? body.site.trim()
          : "";

      if (!site) {
        return failure(
          "Site is required.",
        );
      }

      const key =
        `lex_${crypto.randomUUID().replaceAll("-", "")}`;

      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          key,
          site,
          status: "active",
        })
        .select("*")
        .single();

      if (error) throw error;

      return success(
        data,
        "API key created.",
      );
    }

    if (
      method === "DELETE" &&
      path.startsWith("keys/")
    ) {
      const id =
        path.split("/")[1];

      if (!id) {
        return failure(
          "API key ID is required.",
        );
      }

      const { data, error } = await supabase
        .from("api_keys")
        .update({
          status: "revoked",
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return failure(
          "API key not found.",
          404,
        );
      }

      return success(
        data,
        "API key revoked.",
      );
    }

    // ---------------------------------------------------------
    // LIST DOCUMENTS
    // ---------------------------------------------------------

    if (
      method === "GET" &&
      path === "documents"
    ) {
      const { data, error } = await supabase
        .from("documents")
        .select(documentSelect())
        .order("created_at", {
          ascending: false,
        })
        .limit(100);

      if (error) throw error;

      return success(data ?? []);
    }

    // ---------------------------------------------------------
    // CREATE DOCUMENT FROM TEXT
    // ---------------------------------------------------------

    if (
      method === "POST" &&
      path === "documents"
    ) {
      const body = await req.json();

      const document = await createDocument({
        title: body.title,
        content: body.content,
        jurisdiction:
          body.jurisdiction,
        document_type:
          body.document_type,
        authority_level:
          body.authority_level,
        official_source:
          body.official_source,
        source_url:
          body.source_url,
        effective_from:
          body.effective_from,
        effective_to:
          body.effective_to,
        current_status:
          body.current_status,
        verification_source:
          body.verification_source,
        version_label:
          body.version_label,
      });

      return success(
        document,
        "Document created and placed in pending review.",
      );
    }

    // ---------------------------------------------------------
    // IMPORT FROM URL
    // ---------------------------------------------------------

    if (
      method === "POST" &&
      path === "documents/import-url"
    ) {
      const body = await req.json();

      const sourceUrl =
        typeof body.url === "string"
          ? body.url.trim()
          : "";

      if (!sourceUrl) {
        return failure(
          "URL is required.",
        );
      }

      const fetched =
        await fetchExternalDocument(
          sourceUrl,
        );

      const extracted =
        await extractDocument(
          fetched.bytes,
          fetched.contentType,
          sourceUrl,
        );

      const title =
        typeof body.title === "string" &&
        body.title.trim()
          ? body.title.trim()
          : new URL(
              fetched.url,
            ).hostname;

      const document =
        await createDocument({
          title,
          content: extracted.content,
          jurisdiction:
            body.jurisdiction,
          document_type:
            body.document_type,
          authority_level:
            body.authority_level,
          official_source:
            body.official_source ||
            fetched.url,
          source_url:
            fetched.url,
          effective_from:
            body.effective_from,
          effective_to:
            body.effective_to,
          current_status:
            body.current_status,
          verification_source:
            body.verification_source,
          version_label:
            body.version_label,
        });

      return success(
        document,
        `Document imported successfully (${extracted.format}). It is awaiting preview/review before indexing.`,
      );
    }

    // ---------------------------------------------------------
    // UPLOAD FILE
    // ---------------------------------------------------------

    if (
      method === "POST" &&
      path === "documents/upload"
    ) {
      const form =
        await req.formData();

      const file =
        form.get("file");

      if (!(file instanceof File)) {
        return failure(
          "No document file was supplied.",
        );
      }

      if (
        file.size > MAX_FILE_BYTES
      ) {
        return failure(
          "File is too large. Maximum size is 20 MB.",
        );
      }

      const bytes =
        new Uint8Array(
          await file.arrayBuffer(),
        );

      const extracted =
        await extractDocument(
          bytes,
          file.type,
          file.name,
        );

      const title =
        String(
          form.get("title") ||
            file.name,
        ).trim();

      const document =
        await createDocument({
          title,
          content:
            extracted.content,
          jurisdiction:
            form.get("jurisdiction"),
          document_type:
            form.get("document_type"),
          authority_level:
            form.get("authority_level"),
          official_source:
            form.get("official_source"),
          source_url:
            form.get("source_url"),
          effective_from:
            form.get("effective_from"),
          effective_to:
            form.get("effective_to"),
          current_status:
            form.get("current_status"),
          verification_source:
            form.get("verification_source"),
          version_label:
            form.get("version_label"),
        });

      return success(
        document,
        `File uploaded successfully (${extracted.format}). It is awaiting preview/review before indexing.`,
      );
    }

    // ---------------------------------------------------------
    // DOCUMENT PREVIEW
    // ---------------------------------------------------------

    const previewMatch =
      path.match(/^documents\/([^/]+)\/preview$/);

    if (
      method === "GET" &&
      previewMatch
    ) {
      const id =
        previewMatch[1];

      const document =
        await getDocument(id);

      const chunks =
        buildChunks(
          document.content,
          document.title,
        );

      const chunkPreviews =
        chunks
          .slice(0, 12)
          .map((chunk) => ({
            index: chunk.index,
            section_number:
              chunk.section_number,
            subsection:
              chunk.subsection,
            source_locator:
              chunk.source_locator,
            content:
              chunk.content,
          }));

      const sections = [
        ...new Set(
          chunks
            .map(
              (chunk) =>
                chunk.section_number,
            )
            .filter(Boolean),
        ),
      ];

      const pagesDetected =
        (
          document.content.match(
            /\f/g,
          ) || []
        ).length + 1;

      return success({
        document: {
          ...document,
          full_content:
            document.content,
        },
        analysis: {
          characters:
            document.content.length,
          pages_detected:
            document.content.includes("\f")
              ? pagesDetected
              : 0,
          sections_detected:
            sections.length,
          sections,
          planned_chunks:
            chunks.length,
          chunk_previews:
            chunkPreviews,
        },
      });
    }

    // ---------------------------------------------------------
    // INDEX DOCUMENT - BATCHED
    // ---------------------------------------------------------

    const indexMatch =
      path.match(/^documents\/([^/]+)\/index$/);

    if (
      method === "POST" &&
      indexMatch
    ) {
      const id =
        indexMatch[1];

      const body =
        await req.json().catch(
          () => ({}),
        );

      const offsetParam =
        Number(
          url.searchParams.get(
            "offset",
          ) ??
            body.offset ??
            0,
        );

      const batchParam =
        Number(
          url.searchParams.get(
            "batch_size",
          ) ??
            body.batch_size ??
            INDEX_BATCH_SIZE,
        );

      const reset =
        String(
          url.searchParams.get(
            "reset",
          ) ??
            body.reset ??
            "false",
        ).toLowerCase() ===
        "true";

      const result =
        await indexDocumentBatch(
          id,
          offsetParam,
          batchParam,
          reset,
        );

      return success(
        result,
        result.completed
          ? "Document indexing completed."
          : "Indexing batch completed.",
      );
    }

    // ---------------------------------------------------------
    // REINDEX DOCUMENT
    // ---------------------------------------------------------

    const reindexMatch =
      path.match(/^documents\/([^/]+)\/reindex$/);

    if (
      method === "POST" &&
      reindexMatch
    ) {
      const id =
        reindexMatch[1];

      const result =
        await indexDocumentBatch(
          id,
          0,
          INDEX_BATCH_SIZE,
          true,
        );

      return success(
        result,
        result.completed
          ? "Document reindexed."
          : "Reindexing started.",
      );
    }

    // ---------------------------------------------------------
    // UPDATE VERIFICATION
    // ---------------------------------------------------------

    const verificationMatch =
      path.match(
        /^documents\/([^/]+)\/verification$/,
      );

    if (
      method === "PATCH" &&
      verificationMatch
    ) {
      const id =
        verificationMatch[1];

      const body =
        await req.json();

      const update: Record<
        string,
        unknown
      > = {
        updated_at:
          new Date().toISOString(),
        last_verified_at:
          new Date().toISOString(),
      };

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
        body.verification_source !==
        undefined
      ) {
        update.verification_source =
          body.verification_source
            ? String(
                body.verification_source,
              ).trim()
            : null;
      }

      if (
        body.effective_from !==
        undefined
      ) {
        update.effective_from =
          validateDate(
            body.effective_from,
          );
      }

      if (
        body.effective_to !==
        undefined
      ) {
        update.effective_to =
          validateDate(
            body.effective_to,
          );
      }

      if (
        body.version_label !==
        undefined
      ) {
        update.version_label =
          body.version_label
            ? String(
                body.version_label,
              ).trim()
            : null;
      }

      if (
        body.authority_level !==
        undefined
      ) {
        update.authority_level =
          normalizeAuthority(
            body.authority_level,
          );
      }

      const { data, error } =
        await supabase
          .from("documents")
          .update(update)
          .eq("id", id)
          .select(documentSelect())
          .maybeSingle();

      if (error) throw error;

      if (!data) {
        return failure(
          "Document not found.",
          404,
        );
      }

      return success(
        data,
        "Verification metadata updated.",
      );
    }

    // ---------------------------------------------------------
    // REJECT DOCUMENT
    // ---------------------------------------------------------

    const rejectMatch =
      path.match(
        /^documents\/([^/]+)\/reject$/,
      );

    if (
      method === "PATCH" &&
      rejectMatch
    ) {
      const id =
        rejectMatch[1];

      const body =
        await req.json().catch(
          () => ({}),
        );

      const reason =
        typeof body.reason === "string"
          ? body.reason.trim()
          : "Rejected during admin review.";

      const { data, error } =
        await supabase
          .from("documents")
          .update({
            status: "rejected",
            error_log: reason,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", id)
          .select(documentSelect())
          .maybeSingle();

      if (error) throw error;

      if (!data) {
        return failure(
          "Document not found.",
          404,
        );
      }

      return success(
        data,
        "Document rejected.",
      );
    }

    // ---------------------------------------------------------
    // DELETE DOCUMENT
    // ---------------------------------------------------------

    const deleteDocumentMatch =
      path.match(
        /^documents\/([^/]+)$/,
      );

    if (
      method === "DELETE" &&
      deleteDocumentMatch
    ) {
      const id =
        deleteDocumentMatch[1];

      /*
       * Delete chunks first.
       * If this fails, the document itself is NOT deleted,
       * preventing an orphaned knowledge index.
       */
      const { error: chunkError } =
        await supabase
          .from("knowledge_chunks")
          .delete()
          .eq("document_id", id);

      if (chunkError) {
        throw new Error(
          `Could not remove document chunks: ${chunkError.message}`,
        );
      }

      const { data, error } =
        await supabase
          .from("documents")
          .delete()
          .eq("id", id)
          .select("id")
          .maybeSingle();

      if (error) throw error;

      if (!data) {
        return failure(
          "Document not found.",
          404,
        );
      }

      return success(
        data,
        "Document and indexed chunks removed.",
      );
    }

    return failure(
      `Endpoint not found: ${method} /${path}`,
      404,
    );
  } catch (error) {
    console.error(
      "LexAI Admin Error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return failure(
      message || "Internal server error.",
      500,
    );
  }
});
