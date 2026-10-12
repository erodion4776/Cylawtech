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
const FETCH_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;
const EMBEDDING_DIM = 384;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// HELPERS
// ============================================================

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message: string, status = 500) {
  return json({ error: message }, status);
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

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  let t = html;
  t = t.replace(/<(script|style|noscript|iframe|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, "\n");
  t = t.replace(/<(br|\/p|\/div|\/section|\/h[1-6])[^>]*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeHtmlEntities(t));
}

// ============================================================
// SSRF PROTECTION
// ============================================================

function validateExternalUrl(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Invalid URL."); }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP/HTTPS allowed.");
  }
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
    h === "0.0.0.0" || h === "127.0.0.1" || h === "169.254.169.254" ||
    h.includes("supabase.co") || h.includes("supabase.in") ||
    h.includes("metadata.google")
  ) {
    throw new Error("Internal/private URLs are blocked.");
  }
  const parts = h.split(".").map(Number);
  if (parts.length === 4 && parts.every(Number.isInteger)) {
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) throw new Error("Private IP.");
    if (parts[0] === 192 && parts[1] === 168) throw new Error("Private IP.");
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) throw new Error("Private IP.");
  }
  return url;
}

async function safeFetchUrl(url: string): Promise<{ text: string; finalUrl: string }> {
  const validated = validateExternalUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(validated.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "LexAI-Verifier/1.0",
        Accept: "text/html,text/plain,application/xhtml+xml,*/*;q=0.8",
      },
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    const raw = await resp.text();

    if (raw.length > MAX_DOWNLOAD_SIZE) {
      throw new Error("Document exceeds 10 MB limit.");
    }

    const text = contentType.includes("html") || contentType.includes("xhtml")
      ? htmlToText(raw)
      : normalizeWhitespace(raw);

    return { text, finalUrl: validated.toString() };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// EMBEDDING & RETRIEVAL
// ============================================================

async function createEmbedding(text: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const result = await model.run(text.substring(0, 1200), {
    mean_pool: true, normalize: true,
  });
  const embedding = Array.from(result as Float32Array).map(Number);
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding dim mismatch: ${embedding.length}`);
  }
  return embedding;
}

interface KBMatch {
  id: string;
  content: string;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
  document_title: string;
  jurisdiction: string;
  current_status: string;
  source_url: string | null;
  url_template: string | null;
  similarity: number;
}

async function searchKnowledgeBase(
  queryText: string,
  jurisdiction: string,
  specificSections: string[] = [],
  matchCount = 6
): Promise<KBMatch[]> {
  const results: KBMatch[] = [];
  const seenIds = new Set<string>();

  // 1. Direct section match
  if (specificSections.length > 0) {
    const { data } = await supabase
      .from("knowledge_chunks")
      .select(`
        id, content, section_number, subsection, source_locator,
        documents!inner (
          title, jurisdiction, current_status, status, source_url, url_template
        )
      `)
      .in("section_number", specificSections)
      .eq("documents.status", "completed");

    if (data) {
      for (const item of data) {
        seenIds.add(item.id);
        const doc = Array.isArray(item.documents) ? item.documents[0] : item.documents;
        if (jurisdiction === "global" || doc?.jurisdiction === jurisdiction) {
          results.push({
            id: item.id,
            content: item.content,
            section_number: item.section_number,
            subsection: item.subsection,
            source_locator: item.source_locator,
            document_title: doc?.title || "Statute",
            jurisdiction: doc?.jurisdiction || jurisdiction,
            current_status: doc?.current_status || "unverified",
            source_url: doc?.source_url || null,
            url_template: doc?.url_template || null,
            similarity: 1.0,
          });
        }
      }
    }
  }

  // 2. Vector search
  try {
    const queryVector = await createEmbedding(queryText);
    const { data: vecMatches, error } = await supabase.rpc("match_legal_chunks", {
      query_embedding: queryVector,
      match_threshold: 0.30,
      match_count: matchCount,
      filter_jurisdiction: jurisdiction === "global" ? null : jurisdiction,
    });

    if (!error && Array.isArray(vecMatches)) {
      for (const item of vecMatches) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push({
            id: item.id,
            content: item.content,
            section_number: item.section_number,
            subsection: item.subsection,
            source_locator: item.source_locator,
            document_title: item.title || "Statute",
            jurisdiction: item.jurisdiction || jurisdiction,
            current_status: item.current_status || "unverified",
            source_url: item.source_url || null,
            url_template: item.url_template || null,
            similarity: item.similarity || 0.7,
          });
        }
      }
    }
  } catch (e) {
    console.warn("Vector search fallback:", e);
  }

  return results;
}

// ============================================================
// CITATION LINK BUILDER
// ============================================================

function buildCitationLink(match: KBMatch): string | null {
  const section = match.section_number;
  if (!section) return match.source_url || null;

  // If document has a URL template like "https://example.com/act#section-{section}"
  if (match.url_template) {
    return match.url_template
      .replace("{section}", section)
      .replace("{subsection}", match.subsection || "");
  }

  // If document has a source URL, append section anchor
  if (match.source_url) {
    const base = match.source_url.replace(/#.*$/, "");
    return `${base}#section-${section}`;
  }

  return null;
}

// ============================================================
// MODE 1: VERIFY EXTERNAL SITE
// ============================================================

async function verifySite(
  url: string,
  jurisdiction: string
) {
  // 1. Fetch and extract content from the external site
  const { text: externalText, finalUrl } = await safeFetchUrl(url);

  if (externalText.length < 50) {
    return {
      verification_status: "insufficient_content",
      confidence_score: 0,
      final_url: finalUrl,
      findings: [],
      warnings: ["The URL returned too little extractable text for verification."],
    };
  }

  // 2. Chunk the external content
  const externalChunks = externalText
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 30)
    .slice(0, 10); // Verify up to 10 representative chunks

  // 3. Cross-reference each chunk against the knowledge base
  const findings: Array<{
    external_excerpt: string;
    kb_match: string | null;
    kb_locator: string | null;
    kb_status: string | null;
    citation_url: string | null;
    similarity: number;
    verdict: "confirmed" | "partial_match" | "unverified" | "conflicting";
  }> = [];

  let totalSimilarity = 0;

  for (const chunk of externalChunks) {
    const matches = await searchKnowledgeBase(chunk, jurisdiction, [], 2);

    if (matches.length > 0 && matches[0].similarity >= 0.70) {
      const best = matches[0];
      totalSimilarity += best.similarity;
      findings.push({
        external_excerpt: chunk.substring(0, 200),
        kb_match: best.content.substring(0, 300),
        kb_locator: best.source_locator,
        kb_status: best.current_status,
        citation_url: buildCitationLink(best),
        similarity: Number(best.similarity.toFixed(3)),
        verdict: best.similarity >= 0.85 ? "confirmed" : "partial_match",
      });
    } else if (matches.length > 0 && matches[0].similarity >= 0.45) {
      const best = matches[0];
      totalSimilarity += best.similarity;
      findings.push({
        external_excerpt: chunk.substring(0, 200),
        kb_match: best.content.substring(0, 300),
        kb_locator: best.source_locator,
        kb_status: best.current_status,
        citation_url: buildCitationLink(best),
        similarity: Number(best.similarity.toFixed(3)),
        verdict: "partial_match",
      });
    } else {
      findings.push({
        external_excerpt: chunk.substring(0, 200),
        kb_match: null,
        kb_locator: null,
        kb_status: null,
        citation_url: null,
        similarity: 0,
        verdict: "unverified",
      });
    }
  }

  const avgSimilarity = externalChunks.length > 0
    ? totalSimilarity / externalChunks.length
    : 0;

  const confirmedCount = findings.filter((f) => f.verdict === "confirmed").length;
  const unverifiedCount = findings.filter((f) => f.verdict === "unverified").length;

  let overallStatus: string;
  if (confirmedCount === externalChunks.length) {
    overallStatus = "verified";
  } else if (confirmedCount + findings.filter((f) => f.verdict === "partial_match").length >= externalChunks.length * 0.6) {
    overallStatus = "partially_verified";
  } else if (unverifiedCount >= externalChunks.length * 0.7) {
    overallStatus = "unverified";
  } else {
    overallStatus = "partially_verified";
  }

  const warnings: string[] = [];
  if (unverifiedCount > 0) {
    warnings.push(`${unverifiedCount} of ${externalChunks.length} content blocks could not be matched to the knowledge base.`);
  }
  const repealedMatches = findings.filter((f) => f.kb_status === "repealed");
  if (repealedMatches.length > 0) {
    warnings.push(`⚠️ This site references provisions marked as REPEALED in the knowledge base.`);
    overallStatus = "conflicting";
  }

  return {
    verification_status: overallStatus,
    confidence_score: Number(avgSimilarity.toFixed(3)),
    final_url: finalUrl,
    chunks_analyzed: externalChunks.length,
    chunks_confirmed: confirmedCount,
    findings,
    warnings,
  };
}

// ============================================================
// MODE 2: VERIFY USER-SUBMITTED CONTENT
// ============================================================

async function verifyContent(
  text: string,
  jurisdiction: string
) {
  const userChunks = text
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 20)
    .slice(0, 12);

  if (userChunks.length === 0) {
    return {
      verification_status: "insufficient_content",
      confidence_score: 0,
      findings: [],
      warnings: ["Submitted text is too short or empty for verification."],
    };
  }

  // Extract any section references from the user's text
  const sectionRefs = new Set<string>();
  const sectionRegex = /(?:section|sec\.|s\.|article)\s*(\d+[A-Za-z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(text)) !== null) {
    sectionRefs.add(m[1]);
  }

  const findings: Array<{
    submitted_excerpt: string;
    kb_match: string | null;
    kb_locator: string | null;
    kb_status: string | null;
    citation_url: string | null;
    similarity: number;
    verdict: "confirmed" | "partial_match" | "unverified" | "conflicting" | "outdated";
  }> = [];

  let totalSim = 0;

  for (const chunk of userChunks) {
    const sections = [...sectionRefs];
    const matches = await searchKnowledgeBase(chunk, jurisdiction, sections, 2);

    if (matches.length > 0 && matches[0].similarity >= 0.75) {
      const best = matches[0];
      totalSim += best.similarity;

      let verdict: "confirmed" | "partial_match" | "outdated" = "confirmed";
      if (best.current_status === "repealed" || best.current_status === "superseded") {
        verdict = "outdated";
      } else if (best.similarity < 0.85) {
        verdict = "partial_match";
      }

      findings.push({
        submitted_excerpt: chunk.substring(0, 250),
        kb_match: best.content.substring(0, 350),
        kb_locator: best.source_locator,
        kb_status: best.current_status,
        citation_url: buildCitationLink(best),
        similarity: Number(best.similarity.toFixed(3)),
        verdict,
      });
    } else {
      findings.push({
        submitted_excerpt: chunk.substring(0, 250),
        kb_match: null,
        kb_locator: null,
        kb_status: null,
        citation_url: null,
        similarity: 0,
        verdict: "unverified",
      });
    }
  }

  const avgSim = totalSim / userChunks.length;
  const confirmed = findings.filter((f) => f.verdict === "confirmed").length;
  const outdated = findings.filter((f) => f.verdict === "outdated").length;
  const unverified = findings.filter((f) => f.verdict === "unverified").length;

  let status: string;
  if (outdated > 0) status = "outdated";
  else if (confirmed >= userChunks.length * 0.8) status = "verified";
  else if (confirmed + findings.filter((f) => f.verdict === "partial_match").length >= userChunks.length * 0.5) status = "partially_verified";
  else status = "unverified";

  const warnings: string[] = [];
  if (outdated > 0) warnings.push(`⚠️ ${outdated} provision(s) in the submitted text appear to reference REPEALED or SUPERSEDED law.`);
  if (unverified > 0) warnings.push(`${unverified} excerpt(s) could not be matched to any indexed authority.`);

  return {
    verification_status: status,
    confidence_score: 
