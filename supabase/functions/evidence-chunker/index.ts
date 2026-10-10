import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CHUNK_CHARS = 1800;
const MAX_RETURNED_CHUNKS = 100;

interface Chunk {
  index: number;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
  content: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSubsection(value: string): string {
  const v = value.trim();

  // Common OCR substitutions in statutory numbering.
  if (/^[Il]$/.test(v)) return "1";
  if (/^[Oo]$/.test(v)) return "0";

  return v.toLowerCase();
}

function splitLongText(text: string): string[] {
  const result: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_CHUNK_CHARS) {
    let cut = remaining.lastIndexOf(
      "\n",
      MAX_CHUNK_CHARS,
    );

    if (cut < Math.floor(MAX_CHUNK_CHARS * 0.5)) {
      cut = remaining.lastIndexOf(
        ". ",
        MAX_CHUNK_CHARS,
      );

      if (cut >= Math.floor(MAX_CHUNK_CHARS * 0.5)) {
        cut += 1;
      }
    }

    if (cut < Math.floor(MAX_CHUNK_CHARS * 0.5)) {
      cut = MAX_CHUNK_CHARS;
    }

    const part = remaining.slice(0, cut).trim();

    if (part) result.push(part);

    remaining = remaining.slice(cut).trim();
  }

  if (remaining) result.push(remaining);

  return result;
}

function buildChunks(
  source: string,
  title: string,
): Chunk[] {
  const content = cleanText(source);
  if (!content) return [];

  const lines = content.split("\n");
  const chunks: Chunk[] = [];

  let section: string | null = null;
  let subsection: string | null = null;
  let buffer: string[] = [];
  let bufferSourceLine = 1;

  function emit(): void {
    const body = buffer.join("\n").trim();

    if (!body) return;

    for (const part of splitLongText(body)) {
      chunks.push({
        index: chunks.length,
        section_number: section,
        subsection,
        source_locator: [
          title,
          section ? `Section ${section}` : null,
          subsection ? `Subsection ${subsection}` : null,
          `Source line ${bufferSourceLine}`,
        ]
          .filter(Boolean)
          .join(" > "),
        content: part,
      });
    }

    buffer = [];
  }

  function flush(): void {
    emit();
  }

  function isPageNoise(line: string): boolean {
    return (
      /^page\s+\d+$/i.test(line) ||
      /^evidence act$/i.test(line) ||
      /^2011\s+no\.?\s*18$/i.test(line) ||
      /^a\s+\d{2,4}$/i.test(line)
    );
  }

  function detectHeading(
    line: string,
  ): {
    section: string;
    subsection: string | null;
  } | null {
    // Example: 83.—(1) ...
    // Example: 84 - (1) ...
    // Do not accept a bare number or ordinary TOC title.
    const statutory = line.match(
      /^(\d{1,3}[A-Za-z]?)\s*(?:[.,:;]+\s*[—–-]+|[—–-]+)\s*(?:\(\s*([0-9]{1,2}|[IlOo]|[A-Za-z])\s*\))?/,
    );

    if (statutory) {
      return {
        section: statutory[1],
        subsection: statutory[2]
          ? normalizeSubsection(statutory[2])
          : null,
      };
    }

    // Explicit labels such as "Section 83.—(1) ..."
    const explicit = line.match(
      /^(?:section|sec\.|s\.)\s*(\d{1,3}[A-Za-z]?)\s*(?:[.,:—–-]+\s*)?(?:\(\s*([0-9]{1,2}|[IlOo]|[A-Za-z])\s*\))?/i,
    );

    if (explicit) {
      return {
        section: explicit[1],
        subsection: explicit[2]
          ? normalizeSubsection(explicit[2])
          : null,
      };
    }

    // OCR sometimes loses the statutory dash.
    // Only accept a long, provision-like sentence.
    const plain = line.match(/^(\d{1,3})\.\s+(.+)$/);

    if (plain) {
      const remainder = plain[2].trim();

      const looksSubstantive =
        remainder.length >= 35 &&
        /\b(shall|may|means|includes|every|where|if|any person|in any proceeding|for the purposes of)\b/i.test(
          remainder,
        );

      if (looksSubstantive) {
        return {
          section: plain[1],
          subsection: null,
        };
      }
    }

    return null;
  }

  function subsectionLabel(marker: string): string {
    const next = normalizeSubsection(marker);

    // Numeric markers start a new main subsection.
    if (/^\d{1,2}$/.test(next)) {
      return next;
    }

    // Lettered paragraphs belong under the current numbered
    // subsection: (2) followed by (a) becomes 2(a).
    if (/^[a-z]$/.test(next)) {
      if (subsection && /^\d{1,2}$/.test(subsection)) {
        return `${subsection}(${next})`;
      }

      return next;
    }

    return next;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    if (!line || isPageNoise(line)) continue;

    const heading = detectHeading(line);

    if (heading) {
      flush();

      section = heading.section;
      subsection = heading.subsection;
      bufferSourceLine = lineNumber;
      buffer.push(line);
      continue;
    }

    // Only interpret subsection markers after a section
    // has been detected. Avoid treating the table of contents
    // as a sequence of legal provisions.
    const marker = line.match(
      /^\(\s*([0-9]{1,2}|[A-Za-z])\s*\)\s*/,
    );

    if (marker && section) {
      const next = subsectionLabel(marker[1]);

      if (buffer.length && subsection !== next) {
        flush();
        bufferSourceLine = lineNumber;
      } else if (!buffer.length) {
        bufferSourceLine = lineNumber;
      }

      subsection = next;
      buffer.push(line);
      continue;
    }

    if (!buffer.length) {
      bufferSourceLine = lineNumber;
    }

    buffer.push(line);

    if (
      buffer.join("\n").length >= MAX_CHUNK_CHARS
    ) {
      flush();
      bufferSourceLine = lineNumber + 1;
    }
  }

  flush();

  return chunks;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Use POST for this endpoint." },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const adminKey = Deno.env.get("ADMIN_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!adminKey || !supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: "Required server secrets are missing." },
        { status: 500, headers: corsHeaders },
      );
    }

    const suppliedKey = req.headers.get("x-admin-key");

    if (
      !suppliedKey ||
      suppliedKey.length !== adminKey.length ||
      suppliedKey !== adminKey
    ) {
      return Response.json(
        { error: "Unauthorized." },
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const documentId = body.document_id;
    const requestedSection = String(body.section ?? "").trim();

    if (
      documentId === undefined ||
      documentId === null ||
      !requestedSection
    ) {
      return Response.json(
        {
          error:
            "Provide document_id and section. Example: { document_id: 5, section: \"83\" }",
        },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!/^\d{1,3}[A-Za-z]?$/.test(requestedSection)) {
      return Response.json(
        { error: "Invalid section number." },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: document, error } = await supabase
      .from("documents")
      .select("id, title, content")
      .eq("id", documentId)
      .maybeSingle();

    if (error) {
      return Response.json(
        { error: "Could not read the document.", details: error.message },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!document) {
      return Response.json(
        { error: "Document not found." },
        { status: 404, headers: corsHeaders },
      );
    }

    if (typeof document.content !== "string" || !document.content.trim()) {
      return Response.json(
        { error: "This document has no readable source content." },
        { status: 422, headers: corsHeaders },
      );
    }

    const allChunks = buildChunks(
      document.content,
      document.title ?? `Document ${document.id}`,
    );

    const target = requestedSection.toUpperCase();

    const matchingChunks = allChunks.filter(
      (chunk) =>
        chunk.section_number?.toUpperCase() === target,
    );

    return Response.json(
      {
        mode: "READ_ONLY_PREVIEW",
        database_changed: false,
        document_id: document.id,
        document_title: document.title,
        requested_section: requestedSection,
        total_chunks_generated: allChunks.length,
        matching_chunk_count: matchingChunks.length,
        truncated: matchingChunks.length > MAX_RETURNED_CHUNKS,
        chunks: matchingChunks.slice(0, MAX_RETURNED_CHUNKS),
        warning:
          "Preview only. Nothing was inserted, updated, or deleted. Review OCR and subsection labels before using any indexing function.",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        error: "Unexpected error while generating the preview.",
        details:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
