import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_DOWNLOAD_SIZE = 15 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 35_000;
const EMBEDDING_DIM = 384;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 40;
const MAX_CHUNK_CHARS = 1200;

const VALID_AUTHORITY_LEVELS = ["primary", "secondary", "orientation"];
const VALID_CURRENT_STATUSES = [
  "verified", "partially_verified", "unverified",
  "repealed", "superseded", "amended", "pending_review",
];
const VALID_DOCUMENT_TYPES = [
  "constitution", "statute", "regulation", "rule", "case",
  "judgment", "amendment", "legal_guidance", "orientation", "principle",
];

// ============================================================
// HELPERS
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return json({ success: false, error: message, ...extra }, status);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

function normalizeJurisdiction(value: unknown): string {
  const v = cleanString(value, "nigeria").toLowerCase();
  const map: Record<string, string> = {
    ng: "nigeria", nigeria: "nigeria", "nigerian law": "nigeria",
    us: "us", usa: "us", "united states": "us", "u.s.": "us",
    uk: "uk", "united kingdom": "uk", global: "global",
  };
  return map[v] || v;
}

function normalizeDocumentType(value: unknown): string {
  const type = cleanString(value, "statute").toLowerCase();
  return VALID_DOCUMENT_TYPES.includes(type) ? type : "statute";
}

function normalizeAuthorityLevel(value: unknown): string {
  const level = cleanString(value, "primary").toLowerCase();
  return VALID_AUTHORITY_LEVELS.includes(level) ? level : "primary";
}

function normalizeCurrentStatus(value: unknown): string {
  const status = cleanString(value, "unverified").toLowerCase();
  return VALID_CURRENT_STATUSES.includes(status) ? status : "unverified";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(Number(code)); } catch { return _; }
    });
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

// ============================================================
// SSRF PROTECTION & FETCH
// ============================================================

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") ||
    h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb");
}

function validateExternalUrl(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Invalid URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP/HTTPS allowed.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname === "0.0.0.0" || isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    throw new Error("Local/private network URLs are not allowed.");
  }
  if (hostname.includes("supabase.co") || hostname.includes("supabase.in") ||
    hostname.includes("supabase.net") || hostname === "169.254.169.254" || hostname.includes("metadata.google")) {
    throw new Error("Internal infrastructure endpoints are not allowed.");
  }
  return url;
}

async function safeFetch(initialUrl: string, options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<{ response: Response; finalUrl: string }> {
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
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": "LexAI-Legal-Admin/1.0", Accept: "text/html,application/pdf,text/plain,*/*;q=0.8" },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("External URL request timed out.");
      throw new Error(`Unable to fetch: ${err instanceof Error ? err.message : String(err)}`);
    } finally { clearTimeout(timeout); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid redirect.");
      const nextUrl = new URL(location, validated);
      validateExternalUrl(nextUrl.toString());
      currentUrl = nextUrl.toString();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Document exceeds download limit.");
    return { response, finalUrl: validated.toString() };
  }
  throw new Error("Too many redirects.");
}

function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<(script|style|noscript|iframe|svg|canvas|nav|footer|header|form|button)[^>]*>[\s\S]*?<\/\1>/gi, "\n");
  text = text.replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/tr|\/h[1-6])[^>]*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  return normalizeWhitespace(text);
}

// ============================================================
// STATUTORY PARSER & CHUNKING
// ============================================================

const EXPLICIT_SECTION_REGEX =
  /^(?:(?:SECTION|Section|SEC\.|Sec\.|ARTICLE|Article|ART\.|Art\.|RULE|Rule|ORDER|Order|S\.)\s*(\d+[A-Za-z]*)|(\d+[A-Za-z]*)\s*[\.\-—–])(?:\s*[\.\-—–:]|\s+)?(.*)$/i;
const CROSS_REFERENCE_START_REGEX =
  /^(?:under|pursuant to|in accordance with|within the meaning of|see|vide)\s+(?:section|article|rule)\s+\d+/i;

function detectSectionStart(line: string) {
  const trimmed = line.trim();
  if (!trimmed || CROSS_REFERENCE_START_REGEX.test(trimmed))
    return { sectionNumber: null, heading: null, isExplicitSectionStart: false };
  const match = trimmed.match(EXPLICIT_SECTION_REGEX);
  if (!match) return { sectionNumber: null, heading: null, isExplicitSectionStart: false };
  const secNum = match[1] || match[2] || null;
  const headingText = (match[3] || "").trim();
  if (!match[1] && match[2] && headingText.length > 0 && !/^[A-Z(]/.test(headingText))
    return { sectionNumber: null, heading: null, isExplicitSectionStart: false };
  return { sectionNumber: secNum, heading: headingText || null, isExplicitSectionStart: true };
}

function extractSubsectionIndicator(line: string): string | null {
  const match = line.trim().match(/^\(\s*(\d{1,2})\s*\)/);
  return match ? `(${match[1]})` : null;
}

interface LegalChunk {
  content: string; raw_text: string; section_number: string | null;
  heading: string | null; subsection: string | null; source_locator: string;
}

function buildContextualEnvelope(docTitle: string, jurisdiction: string, secNum: string | null, heading: string | null, subsec: string | null, body: string): string {
  const meta: string[] = [`Document: ${docTitle}`];
  if (jurisdiction) meta.push(`Jurisdiction: ${jurisdiction.toUpperCase()}`);
  if (secNum) { let s = `Section ${secNum}`; if (heading) s += ` (${heading})`; meta.push(s); }
  if (subsec) meta.push(`Subsection: ${subsec}`);
  return `[${meta.join(" | ")}]\n${body.trim()}`;
}

function buildSourceLocator(title: string, secNum: string | null, subsec: string | null, chunkIndex: number): string {
  let locator = title;
  if (secNum) { locator += `, s.${secNum}`; if (subsec) locator += subsec; }
  locator += `, chunk ${chunkIndex + 1}`;
  return locator;
}

function chunkLegalContent(title: string, content: string, jurisdiction = "nigeria", maxChars = MAX_CHUNK_CHARS): LegalChunk[] {
  const normalized = normalizeWhitespace(content);
  if (!normalized) return [];
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks: LegalChunk[] = [];
  let currentSectionNum: string | null = null, currentHeading: string | null = null, currentSubsection: string | null = null, currentLines: string[] = [];

  const flush = () => {
    if (currentLines.length === 0) return;
    const rawText = currentLines.join("\n").trim();
    if (!rawText) { currentLines = []; return; }
    const chunkIdx = chunks.length;
    chunks.push({
      content: buildContextualEnvelope(title, jurisdiction, currentSectionNum, currentHeading, currentSubsection, rawText),
      raw_text: rawText, section_number: currentSectionNum, heading: currentHeading,
      subsection: currentSubsection, source_locator: buildSourceLocator(title, currentSectionNum, currentSubsection, chunkIdx),
    });
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const detected = detectSectionStart(line);
    if (detected.isExplicitSectionStart) {
      flush(); currentSectionNum = detected.sectionNumber; currentHeading = detected.heading; currentSubsection = null;
      if (!currentHeading && i + 1 < lines.length && !detectSectionStart(lines[i + 1]).isExplicitSectionStart && !extractSubsectionIndicator(lines[i + 1])) {
        currentHeading = lines[i + 1]; currentLines.push(line); currentLines.push(lines[i + 1]); i++; continue;
      }
      currentLines.push(line); continue;
    }
    const detectedSub = extractSubsectionIndicator(line);
    if (detectedSub) {
      if (currentLines.join("\n").length + line.length > maxChars) flush();
      currentSubsection = detectedSub; currentLines.push(line); continue;
    }
    if (currentLines.length > 0 && currentLines.join("\n").length + line.length > maxChars) flush();
    currentLines.push(line);
  }
  flush();
  if (chunks.length === 0) {
    return [{ content: buildContextualEnvelope(title, jurisdiction, null, null, null, normalized), raw_text: normalized, section_number: null, heading: null, subsection: null, source_locator: buildSourceLocator(title, null, null, 0) }];
  }
  return chunks;
}

// ============================================================
// EMBEDDING
// ============================================================

async function createEmbedding(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const result = await model.run(text.substring(0, 1500), { mean_pool: true, normalize: true });
  const embedding = Array.from(result as Float32Array).map(Number);
  if (embedding.length !== EMBEDDING_DIM) throw new Error(`Embedding dim mismatch: ${embedding.length}`);
  if (embedding.some((val) => !Number.isFinite(val))) throw new Error("Invalid embedding values.");
  return embedding;
}

// ============================================================
// DOCUMENT MANAGEMENT
// ============================================================

async function getDocument(documentId: string) {
  const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (error || !data) throw new Error(`Unable to load document: ${error?.message || "Not found"}`);
  return data;
}

async function prepareDocumentForIndexing(documentId: string) {
  const document = await getDocument(documentId);
  if (document.status === "rejected") throw new Error("Rejected documents cannot be indexed.");
  if (!document.content || document.content.trim().length < 10) throw new Error("Document text is insufficient.");
  const chunks = chunkLegalContent(document.title, document.content, document.jurisdiction || "nigeria");
  if (chunks.length === 0) throw new Error("No legal chunks could be parsed.");
  await supabase.from("documents").update({ status: "processing", total_sections: chunks.length, processed_sections: 0, error_log: null, updated_at: new Date().toISOString() }).eq("id", documentId);
  return { document, chunks };
}

async function indexDocumentBatch(documentId: string, offset: number, batchSize: number) {
  const document = await getDocument(documentId);
  if (document.status === "rejected") throw new Error("Rejected documents cannot be indexed.");
  const chunks = chunkLegalContent(document.title, document.content || "", document.jurisdiction || "nigeria");
  const totalChunks = chunks.length;
  if (totalChunks === 0) throw new Error("No statutory chunks could be extracted.");
  if (offset === 0) {
    const { error: clearError } = await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);
    if (clearError) throw new Error(`Failed to clear chunks: ${clearError.message}`);
  }
  if (offset >= totalChunks) {
    await supabase.from("documents").update({ status: "completed", total_sections: totalChunks, processed_sections: totalChunks, error_log: null, updated_at: new Date().toISOString() }).eq("id", documentId);
    return { completed: true, total: totalChunks, processed: totalChunks, next_offset: totalChunks, inserted: 0 };
  }
  const batch = chunks.slice(offset, offset + batchSize);
  const records: Record<string, unknown>[] = [];
  for (let i = 0; i < batch.length; i++) {
    const chunk = batch[i]; const absoluteIndex = offset + i;
    try {
      const embedding = await createEmbedding(chunk.content);
      records.push({ document_id: documentId, content: chunk.content, embedding, section_number: chunk.section_number, subsection: chunk.subsection, source_locator: chunk.source_locator });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await supabase.from("documents").update({ status: "failed", error_log: `Chunk ${absoluteIndex + 1}: ${errMsg}`, updated_at: new Date().toISOString() }).eq("id", documentId);
      throw new Error(`Embedding failed for chunk ${absoluteIndex + 1}: ${errMsg}`);
    }
  }
  if (records.length > 0) {
    const { error: insertError } = await supabase.from("knowledge_chunks").insert(records);
    if (insertError) {
      await supabase.from("documents").update({ status: "failed", error_log: insertError.message, updated_at: new Date().toISOString() }).eq("id", documentId);
      throw new Error(`Insert error: ${insertError.message}`);
    }
  }
  const nextOffset = offset + records.length;
  const isComplete = nextOffset >= totalChunks;
  await supabase.from("documents").update({ status: isComplete ? "completed" : "processing", total_sections: totalChunks, processed_sections: nextOffset, error_log: null, updated_at: new Date().toISOString() }).eq("id", documentId);
  return { completed: isComplete, total: totalChunks, processed: nextOffset, next_offset: nextOffset, inserted: records.length };
}

async function extractPdfText(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  try {
    const pdfModule = await import("https://esm.sh/pdf-parse@1.1.1");
    const pdfParse = pdfModule.default || pdfModule;
    const parsed = await pdfParse(new Uint8Array(buffer));
    const text = normalizeWhitespace(parsed.text || "");
    const pages = Number(parsed.numpages) || 0;
    if (!text || text.length < 20) throw new Error("PDF contains no extractable text. OCR required.");
    return { text, pages };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function detectContentType(response: Response, finalUrl: string): string {
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/pdf") || finalUrl.toLowerCase().endsWith(".pdf")) return "pdf";
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  return "text";
}

function createPreview(title: string, content: string, jurisdiction = "nigeria") {
  const normalized = normalizeWhitespace(content);
  const chunks = chunkLegalContent(title, normalized, jurisdiction);
  const sectionsDetected = new Set<string>();
  for (const c of chunks) { if (c.section_number) { let label = `Section ${c.section_number}`; if (c.heading) label += `: ${c.heading}`; sectionsDetected.add(label); } }
  return { characters: normalized.length, words: normalized ? normalized.split(/\s+/).length : 0, sections_count: sectionsDetected.size, sections: Array.from(sectionsDetected), planned_chunks: chunks.length, preview: normalized.substring(0, 10_000) };
}

// ============================================================
// USER MANAGEMENT
// ============================================================

async function listUsers() {
  const { data: usageRecords, error: usageError } = await supabase
    .from("user_usage")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (usageError) throw usageError;

  const users = [];
  for (const record of usageRecords || []) {
    let email = "User";
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(record.user_id);
      if (authUser?.user?.email) email = authUser.user.email;
    } catch { /* silent */ }

    users.push({
      user_id: record.user_id,
      email,
      trial_messages_used: record.trial_messages_used || 0,
      trial_limit: record.trial_limit || 10,
      is_subscribed: record.is_subscribed || false,
      subscription_tier: record.subscription_tier || "free",
      subscription_expires_at: record.subscription_expires_at,
      is_banned: record.is_banned || false,
      ban_reason: record.ban_reason || null,
      banned_at: record.banned_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
  }

  return users;
}

async function updateUser(userId: string, updates: Record<string, unknown>) {
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("is_subscribed" in updates) allowed.is_subscribed = Boolean(updates.is_subscribed);
  if ("subscription_tier" in updates) {
    const tier = String(updates.subscription_tier).toLowerCase();
    if (["free", "premium", "enterprise"].includes(tier)) allowed.subscription_tier = tier;
  }
  if ("trial_limit" in updates) {
    const limit = Number(updates.trial_limit);
    if (Number.isFinite(limit) && limit >= 1 && limit <= 10000) allowed.trial_limit = Math.floor(limit);
  }
  if ("trial_messages_used" in updates) {
    const used = Number(updates.trial_messages_used);
    if (Number.isFinite(used) && used >= 0) allowed.trial_messages_used = Math.floor(used);
  }
  if ("is_banned" in updates) {
    allowed.is_banned = Boolean(updates.is_banned);
    if (Boolean(updates.is_banned)) {
      allowed.ban_reason = cleanString(updates.ban_reason, "Banned by administrator");
      allowed.banned_at = new Date().toISOString();
    } else {
      allowed.ban_reason = null;
      allowed.banned_at = null;
    }
  }
  if ("subscription_expires_at" in updates) {
    allowed.subscription_expires_at = updates.subscription_expires_at || null;
  }

  const { data, error } = await supabase
    .from("user_usage")
    .update(allowed)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// QA BENCHMARK LOGS
// ============================================================

async function getQALogs() {
  const { data, error } = await supabase
    .from("qa_benchmark_logs")
    .select("*")
    .order("tested_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function logQAError(req: Request) {
  const body = await req.json();
  const { benchmark_id, category, question_asked, ai_answer, what_was_wrong, why_it_was_wrong, correct_authority, general_training_rule, jurisdiction = "nigeria" } = body;
  if (!question_asked || !what_was_wrong || !general_training_rule) return errorResponse("Missing required QA fields.", 400);

  const { data, error } = await supabase.from("qa_benchmark_logs").insert({
    benchmark_id: benchmark_id || `QA-${Date.now()}`,
    category: category || "general_failure",
    question_asked, ai_answer: ai_answer || "", what_was_wrong,
    why_it_was_wrong: why_it_was_wrong || "", correct_authority: correct_authority || "",
    general_training_rule, jurisdiction, passed: false, retest_status: "training_rule_generated",
  }).select().single();

  if (error) throw error;
  return json({ success: true, message: "QA Error Logged.", data }, 201);
}

// ============================================================
// SETTINGS (WITH AUTO-CREATION TO PREVENT 404)
// ============================================================

async function handleSettings(method: string, req: Request) {
  if (method === "GET") {
    let { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
    if (error) throw error;

    // If table is empty, auto-create default row so login never fails with 404
    if (!data) {
      const { data: created, error: createError } = await supabase
        .from("settings")
        .insert({ api_enabled: true, active_model: "llama-3.3-70b-versatile" })
        .select()
        .single();
      if (!createError && created) data = created;
    }

    return json({ success: true, data: data || { api_enabled: true, active_model: "llama-3.3-70b-versatile" } });
  }

  if (method === "PATCH") {
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.api_enabled === "boolean") updates.api_enabled = body.api_enabled;
    if (typeof body.active_model === "string" && body.active_model.trim()) updates.active_model = body.active_model.trim();
    let query = supabase.from("settings").update(updates);
    if (body.id) query = query.eq("id", body.id);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return json({ success: true, data });
  }
  return errorResponse("Method not allowed.", 405);
}

async function handleKeys(method: string, path: string, req: Request) {
  if (method === "GET" && path === "keys") {
    const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return json({ success: true, data: data || [] });
  }
  if (method === "POST" && path === "keys") {
    const body = await req.json();
    const site = cleanString(body.site);
    if (!site) return errorResponse("Client name is required.", 400);
    const key = `lex_${crypto.randomUUID().replace(/-/g, "")}`;
    const { data, error } = await supabase.from("api_keys").insert({ key, site, status: "active" }).select().single();
    if (error) throw error;
    return json({ success: true, data }, 201);
  }
  if (method === "DELETE" && path.startsWith("keys/")) {
    const id = path.split("/")[1];
    if (!id) return errorResponse("Key ID required.", 400);
    const { error } = await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id);
    if (error) throw error;
    return json({ success: true, message: "Key revoked." });
  }
  return null;
}

// ============================================================
// DOCUMENT CRUD
// ============================================================

async function listDocuments() {
  const { data, error } = await supabase.from("documents").select("id,title,jurisdiction,document_type,authority_level,official_source,source_url,url_template,effective_from,effective_to,current_status,last_verified_at,verification_source,version_label,status,total_sections,processed_sections,error_log,created_at,updated_at").order("created_at", { ascending: false }).limit(150);
  if (error) throw error;
  return json({ success: true, data: data || [] });
}

async function createDocument(req: Request) {
  const body = await req.json();
  const title = cleanString(body.title); const content = cleanString(body.content);
  if (!title) return errorResponse("Title required.", 400);
  if (content.length < 10) return errorResponse("Content too short.", 400);
  if (body.source_url) {
    const { data: dup } = await supabase.from("documents").select("id,title").eq("source_url", cleanString(body.source_url)).maybeSingle();
    if (dup) return errorResponse(`Duplicate URL: "${dup.title}"`, 409);
  }
  const { data, error } = await supabase.from("documents").insert({
    title, content, jurisdiction: normalizeJurisdiction(body.jurisdiction),
    document_type: normalizeDocumentType(body.document_type), authority_level: normalizeAuthorityLevel(body.authority_level),
    official_source: cleanString(body.official_source) || null, source_url: cleanString(body.source_url) || null,
    url_template: cleanString(body.url_template) || null, effective_from: cleanString(body.effective_from) || null,
    effective_to: cleanString(body.effective_to) || null, current_status: normalizeCurrentStatus(body.current_status),
    last_verified_at: body.last_verified_at || null, verification_source: cleanString(body.verification_source) || null,
    version_label: cleanString(body.version_label) || null, status: "pending", total_sections: 0, processed_sections: 0, error_log: null,
  }).select().single();
  if (error) throw error;
  return json({ success: true, message: "Document registered.", data }, 201);
}

async function importFromUrl(req: Request) {
  const body = await req.json();
  const sourceUrl = cleanString(body.url);
  if (!sourceUrl) return errorResponse("URL required.", 400);
  const initialUrl = validateExternalUrl(sourceUrl);
  const { response, finalUrl } = await safeFetch(initialUrl.toString());
  const contentType = detectContentType(response, finalUrl);
  const buffer = await response.arrayBuffer();
  let content = ""; let pages = 0;
  if (contentType === "pdf") { const e = await extractPdfText(buffer); content = e.text; pages = e.pages; }
  else { const raw = new TextDecoder().decode(buffer); content = contentType === "html" ? htmlToText(raw) : normalizeWhitespace(raw); }
  if (content.length < 20) return errorResponse("Insufficient text.", 422);
  const title = cleanString(body.title) || decodeURIComponent(new URL(finalUrl).pathname.split("/").filter(Boolean).pop() || new URL(finalUrl).hostname);
  const preview = createPreview(title, content, body.jurisdiction || "nigeria");
  return json({ success: true, source_url: finalUrl, detected_type: contentType, pages_detected: pages, title, content, preview });
}

async function uploadDocument(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return errorResponse("multipart/form-data required.", 400);
  const form = await req.formData(); const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("No file.", 400);
  if (file.size > MAX_UPLOAD_SIZE) return errorResponse("File exceeds 25MB.", 400);
  const filename = file.name.toLowerCase();
  if ([".exe", ".dll", ".bat", ".cmd", ".sh", ".js", ".ts", ".py"].some((ext) => filename.endsWith(ext))) return errorResponse("Executable files not permitted.", 400);
  const arrayBuffer = await file.arrayBuffer(); let extractedText = ""; let pages = 0;
  const isPdf = file.type === "application/pdf" || filename.endsWith(".pdf");
  const isHtml = file.type.includes("html") || filename.endsWith(".html");
  if (isPdf) { const e = await extractPdfText(arrayBuffer); extractedText = e.text; pages = e.pages; }
  else { const raw = new TextDecoder().decode(arrayBuffer); extractedText = isHtml ? htmlToText(raw) : normalizeWhitespace(raw); }
  if (extractedText.length < 20) return errorResponse("Insufficient text. OCR may be required.", 422);
  const title = cleanString(form.get("title")) || file.name.replace(/\.[^.]+$/, "");
  const jurisdiction = normalizeJurisdiction(form.get("jurisdiction"));
  const preview = createPreview(title, extractedText, jurisdiction);
  return json({ success: true, title, filename: file.name, file_type: file.type || "unknown", jurisdiction, document_type: normalizeDocumentType(form.get("document_type")), authority_level: normalizeAuthorityLevel(form.get("authority_level")), current_status: normalizeCurrentStatus(form.get("current_status")), official_source: cleanString(form.get("official_source")) || null, source_url: cleanString(form.get("source_url")) || null, url_template: cleanString(form.get("url_template")) || null, version_label: cleanString(form.get("version_label")) || null, pages_detected: pages, content: extractedText, preview });
}

async function previewDocument(documentId: string) {
  const document = await getDocument(documentId);
  const preview = createPreview(document.title, document.content || "", document.jurisdiction || "nigeria");
  const { data: chunks, error } = await supabase.from("knowledge_chunks").select("id,content,section_number,subsection,source_locator").eq("document_id", documentId).order("id", { ascending: true }).limit(25);
  if (error) throw error;
  return json({ success: true, data: { metadata: { id: document.id, title: document.title, jurisdiction: document.jurisdiction, document_type: document.document_type, authority_level: document.authority_level, official_source: document.official_source, source_url: document.source_url, url_template: document.url_template, effective_from: document.effective_from, effective_to: document.effective_to, current_status: document.current_status, last_verified_at: document.last_verified_at, verification_source: document.verification_source, version_label: document.version_label, status: document.status }, full_content: document.content || "", sections_count: preview.sections_count, sections: preview.sections, planned_chunks: preview.planned_chunks, indexed_chunks: chunks || [] } });
}

async function startIndexing(documentId: string, req: Request, reset: boolean) {
  const document = await getDocument(documentId);
  if (document.status === "rejected") return errorResponse("Rejected documents cannot be indexed.", 400);
  const url = new URL(req.url);
  const batchSize = safeInteger(url.searchParams.get("batch_size"), DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  let offset = 0;
  if (reset) { await prepareDocumentForIndexing(documentId); }
  else { offset = Number(document.processed_sections || 0); if (document.status === "pending" && offset === 0) await prepareDocumentForIndexing(documentId); }
  const result = await indexDocumentBatch(documentId, offset, batchSize);
  return json({ success: true, message: result.completed ? "Indexing complete." : "Batch indexed.", data: { document_id: documentId, ...result } });
}

async function verifyDocument(documentId: string, req: Request) {
  const body = await req.json(); const currentStatus = normalizeCurrentStatus(body.current_status);
  const updates: Record<string, unknown> = { current_status: currentStatus, updated_at: new Date().toISOString() };
  if ("authority_level" in body) updates.authority_level = normalizeAuthorityLevel(body.authority_level);
  if ("official_source" in body) updates.official_source = cleanString(body.official_source) || null;
  if ("source_url" in body) updates.source_url = cleanString(body.source_url) || null;
  if ("url_template" in body) updates.url_template = cleanString(body.url_template) || null;
  if ("effective_from" in body) updates.effective_from = cleanString(body.effective_from) || null;
  if ("effective_to" in body) updates.effective_to = cleanString(body.effective_to) || null;
  if ("verification_source" in body) updates.verification_source = cleanString(body.verification_source) || null;
  if ("version_label" in body) updates.version_label = cleanString(body.version_label) || null;
  if (currentStatus === "verified" || currentStatus === "partially_verified") updates.last_verified_at = body.last_verified_at || new Date().toISOString();
  const { data, error } = await supabase.from("documents").update(updates).eq("id", documentId).select().single();
  if (error) throw error;
  return json({ success: true, message: "Verification updated.", data });
}

async function rejectDocument(documentId: string) {
  const { data, error } = await supabase.from("documents").update({ status: "rejected", error_log: "Rejected by administrator.", updated_at: new Date().toISOString() }).eq("id", documentId).select().single();
  if (error) throw error;
  return json({ success: true, message: "Document rejected.", data });
}

async function deleteDocument(documentId: string) {
  const { error: chunkErr } = await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);
  if (chunkErr) throw new Error(`Chunk delete failed: ${chunkErr.message}`);
  const { error: docErr } = await supabase.from("documents").delete().eq("id", documentId);
  if (docErr) throw new Error(`Document delete failed: ${docErr.message}`);
  return json({ success: true, message: "Document and chunks removed." });
}

// ============================================================
// MAIN DISPATCHER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Sanitize and trim admin key comparisons
    const rawAdminKey = req.headers.get("x-admin-key") || "";
    const rawExpectedKey = Deno.env.get("ADMIN_KEY") || "";

    const adminKey = rawAdminKey.trim().replace(/^["']|["']$/g, "");
    const expectedKey = rawExpectedKey.trim().replace(/^["']|["']$/g, "");

    if (!expectedKey) {
      return errorResponse("Server configuration error: ADMIN_KEY is not configured in Supabase Secrets.", 500);
    }
    if (!adminKey || adminKey !== expectedKey) {
      return errorResponse("Unauthorized: Invalid administrator key.", 403);
    }

    const url = new URL(req.url);
    let path = url.pathname.replace(/^.*\/admin\//, "");
    if (path === url.pathname && path.startsWith("admin/")) path = path.substring("admin/".length);
    path = path.replace(/^\/+/, "").replace(/\/+$/, "");
    const method = req.method.toUpperCase();

    if (path === "settings") return await handleSettings(method, req);

    const keyRes = await handleKeys(method, path, req);
    if (keyRes) return keyRes;

    // ---- USER MANAGEMENT ----
    if (method === "GET" && path === "users") {
      const users = await listUsers();
      return json({ success: true, data: users });
    }

    const userMatch = path.match(/^users\/([^/]+)$/);
    if (userMatch && method === "PATCH") {
      const userId = userMatch[1];
      const body = await req.json();
      const updated = await updateUser(userId, body);
      return json({ success: true, message: "User updated.", data: updated });
    }

    // ---- QA LOGS ----
    if (method === "GET" && path === "qa/logs") {
      const logs = await getQALogs();
      return json({ success: true, data: logs });
    }
    if (method === "POST" && path === "qa/log-error") return await logQAError(req);

    // ---- DOCUMENTS ----
    if (method === "GET" && path === "documents") return await listDocuments();
    if (method === "POST" && path === "documents") return await createDocument(req);

    if (method === "POST" && path === "embed") {
      const body = await req.json(); const content = cleanString(body.text || body.content);
      if (!content) return errorResponse("Content required.", 400);
      const compReq = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ title: body.title || "Imported Legal Text", content, jurisdiction: body.jurisdiction || "nigeria", document_type: body.document_type || "statute", authority_level: body.authority_level || "orientation", current_status: "unverified" }) });
      return await createDocument(compReq);
    }

    if (method === "POST" && path === "documents/import-url") return await importFromUrl(req);
    if (method === "POST" && path === "documents/upload") return await uploadDocument(req);

    const docMatch = path.match(/^documents\/([^/]+)(?:\/(.*))?$/);
    if (docMatch) {
      const docId = docMatch[1]; const action = docMatch[2] || "";
      if (method === "GET" && action === "preview") return await previewDocument(docId);
      if (method === "POST" && action === "index") return await startIndexing(docId, req, url.searchParams.get("reset") === "true");
      if (method === "POST" && action === "reindex") return await startIndexing(docId, req, true);
      if (method === "PATCH" && action === "verification") return await verifyDocument(docId, req);
      if (method === "PATCH" && action === "reject") return await rejectDocument(docId);
      if (method === "DELETE" && !action) return await deleteDocument(docId);
    }

    return errorResponse("Admin endpoint not found.", 404);
  } catch (err) {
    console.error("Admin Error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal Server Error", 500);
  }
});
