import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Groq from "https://esm.sh/groq-sdk@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const groqApiKey = Deno.env.get("GROQ_API_KEY") || "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const groq = new Groq({
  apiKey: groqApiKey,
});

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// ============================================================
// LEXAI EMBEDDING MODEL
// IMPORTANT:
// This MUST match the model used to create the existing
// 384-dimensional knowledge_chunks embeddings.
// ============================================================

// @ts-ignore
const embeddingModel = new Supabase.ai.Session("gte-small");

// ============================================================
// Generate a 384-dimensional embedding using the SAME model
// used by the existing legal knowledge base.
// ============================================================

async function getEmbedding(
  text: string
): Promise<number[] | null> {
  try {
    const cleanedText = text
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 1000);

    if (!cleanedText) {
      return null;
    }

    // @ts-ignore
    const rawEmbedding = await embeddingModel.run(cleanedText, {
      mean_pool: true,
      normalize: true,
    });

    const embedding = Array.from(rawEmbedding) as number[];

    if (embedding.length !== 384) {
      console.error(
        `Unexpected embedding dimension: ${embedding.length}`
      );

      return null;
    }

    return embedding;
  } catch (error) {
    console.error(
      "LexAI embedding generation error:",
      error
    );

    return null;
  }
}

// ============================================================
// Format retrieved legal sources for the language model
// ============================================================

function formatLegalContext(matches: any[]): string {
  if (!matches || matches.length === 0) {
    return "";
  }

  return matches
    .map((m, index) => {
      const metadata = [
        `SOURCE ${index + 1}`,
        `Document: ${m.document_title}`,
        `Jurisdiction: ${m.jurisdiction || "Unknown"}`,
        `Document Type: ${m.document_type || "Unknown"}`,
        `Authority Level: ${m.authority_level || "Unclassified"}`,
        `Current Status: ${m.current_status || "Unverified"}`,
        `Version: ${m.version_label || "Unknown"}`,
        `Section: ${m.section_number || "Not specified"}`,
        `Subsection: ${m.subsection || "Not specified"}`,
        `Source Locator: ${m.source_locator || "Not specified"}`,
        `Similarity: ${
          typeof m.similarity === "number"
            ? m.similarity.toFixed(4)
            : "N/A"
        }`,
      ].join("\n");

      return `${metadata}

CONTENT:
${m.content}`;
    })
    .join("\n\n==============================\n\n");
}

// ============================================================
// Determine whether the question needs heightened verification
// ============================================================

function requiresVerification(message: string): boolean {
  const text = message.toLowerCase();

  const verificationTerms = [
    "current law",
    "currently",
    "latest law",
    "today",
    "2026",
    "amended",
    "amendment",
    "repealed",
    "repeal",
    "valid",
    "still in force",
    "in force",
    "effective",
    "deadline",
    "limitation",
    "procedure",
    "filing",
    "appeal",
    "bail",
    "arrest",
    "criminal",
    "constitutional",
    "court",
    "judge",
    "judgment",
    "case",
    "precedent",
    "statutory",
  ];

  return verificationTerms.some((term) =>
    text.includes(term)
  );
}

// ============================================================
// Main handler
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    const {
      message,
      jurisdiction = "Nigerian Law",
      stage = "prep",
      editorContent = "",
    } = body;

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({
          error: "Please enter a legal inquiry.",
        }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // ========================================================
    // 1. Platform status
    // ========================================================

    const { data: settings, error: settingsError } =
      await supabase
        .from("settings")
        .select("*")
        .single();

    if (
      !settingsError &&
      settings &&
      settings.api_enabled === false
    ) {
      return new Response(
        JSON.stringify({
          error:
            "LexAI Workspace is temporarily undergoing scheduled maintenance. Please try again shortly.",
        }),
        {
          status: 503,
          headers: corsHeaders,
        }
      );
    }

    // ========================================================
    // 2. Normalize jurisdiction
    // ========================================================

    const normalizedJurisdiction =
      jurisdiction.toLowerCase().includes("nigeria")
        ? "nigeria"
        : jurisdiction.toLowerCase().includes("federal")
        ? "us_federal"
        : jurisdiction.toLowerCase();

    // ========================================================
    // 3. Generate query embedding
    // ========================================================

    const embedding = await getEmbedding(message);

    let matches: any[] = [];
    let retrievalError: string | null = null;

    // ========================================================
    // 4. Search the ACTUAL legal knowledge base
    // ========================================================

    if (embedding) {
      const { data, error } = await supabase.rpc(
        "match_legal_chunks",
        {
          query_embedding: embedding,
          match_threshold: 0.20,
          match_count: 8,
          p_jurisdiction: normalizedJurisdiction,
        }
      );

      if (error) {
        console.error(
          "Legal retrieval error:",
          error
        );

        retrievalError =
          "The legal knowledge retrieval service failed.";
      } else if (data) {
        matches = data;
      }
    } else {
      retrievalError =
        "The legal query could not be embedded.";
    }

    // ========================================================
    // 5. Build legal context
    // ========================================================

    const legalContext =
      formatLegalContext(matches);

    const verificationRequired =
      requiresVerification(message);

    // ========================================================
    // 6. Stage directive
    // ========================================================

    let stageDirective = "";

    if (stage === "prep") {
      stageDirective =
        "Focus on issue identification, legal classification, IRAC analysis, and careful application of the law.";
    } else if (stage === "training") {
      stageDirective = `Review and critique the user's draft:

"""${editorContent || "No draft provided"}"""

Focus on statutory precision, legal reasoning, authority, jurisdiction, exceptions, and professional legal language.`;
    } else if (stage === "practice") {
      stageDirective =
        "Draft precise legal clauses, contract terms, pleadings, or memorandum sections where appropriate.";
    }

    // ========================================================
    // 7. Legal research system prompt
    // ========================================================

    const systemPrompt = `
You are LexAI, a legal research and legal-analysis assistant.

You are NOT permitted to invent statutes, sections, cases,
court decisions, procedural requirements, dates, authorities,
or quotations.

JURISDICTION:
${jurisdiction}

NORMALIZED JURISDICTION:
${normalizedJurisdiction}

PRIMARY TASK:
${stageDirective}

LEGAL RESEARCH RULES:

1. JURISDICTION FIRST
Always determine the relevant jurisdiction before applying law.

For Nigeria, distinguish where relevant between:
- Constitution
- Federal legislation
- State legislation
- Subsidiary legislation
- Rules of court
- Customary law
- Islamic law
- Judicial precedent

Do not automatically apply a Federal Act to a State matter where
State legislation governs.

2. AUTHORITY HIERARCHY

Prefer:
- Constitution
- Statutes
- Subsidiary legislation
- Rules of court
- Reported judicial decisions
- Other reliable legal materials

Do not treat an AI-generated summary as equivalent to primary
legal text.

3. SOURCE DISCIPLINE

The retrieved material below is knowledge-base material.

Do NOT assume that retrieval alone proves that a law is
currently in force.

A source marked "unverified" must be described as unverified.

4. CURRENT-LAW REQUIREMENT

This question appears to require heightened verification:
${verificationRequired ? "YES" : "NO"}

When current validity, amendment, repeal, effective dates,
procedures, deadlines, or later judicial authority matters,
do not falsely claim that the law has been verified.

5. FOUND VS CURRENT

Distinguish clearly between:

FOUND:
The material exists in the LexAI knowledge base.

CURRENT:
The legal position has been independently verified as current.

Do not convert FOUND into CURRENT without verification.

6. MISSING FACTS

If material facts are missing and those facts could change the
legal conclusion, identify the missing facts.

Do not silently assume important facts.

7. EXCEPTIONS

Identify relevant statutory exceptions, limitations,
transitional provisions, jurisdictional limitations, and
procedural requirements when material.

8. CASE LAW

Never invent case names, citations, court levels, years,
holdings, or quotations.

If no verified case authority is available, say so.

9. CONFIDENCE

Where the available material is insufficient for a definitive
answer, say:

VERIFIED
PARTIALLY VERIFIED
or
UNVERIFIED

as appropriate.

10. ANSWER STRUCTURE

Where appropriate, structure the answer as:

Direct Answer
Jurisdiction
Applicable Law
Analysis
Exceptions / Limitations
Authorities / Sources
Verification Status

Do not add a "Law checked as of" date unless the law was
actually checked against an appropriate current source.

KNOWLEDGE BASE RESULTS:

${legalContext || "No matching legal source was retrieved."}

RETRIEVAL STATUS:
${
  retrievalError
    ? retrievalError
    : `Retrieved ${matches.length} legal knowledge-base result(s).`
}

IMPORTANT:
A retrieval failure must never be hidden by pretending that
the answer was based on the legal database.
`;

    // ========================================================
    // 8. Groq reasoning
    // ========================================================

    if (!groqApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "LexAI AI service is not configured.",
        }),
        {
          status: 503,
          headers: corsHeaders,
        }
      );
    }

    const completion =
      await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",

        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: message,
          },
        ],

        temperature: 0.1,
        max_tokens: 1800,
      });

    const reply =
      completion.choices[0]?.message?.content ||
      "Unable to generate legal analysis at this moment.";

    // ========================================================
    // 9. Return response
    // ========================================================

    return new Response(
      JSON.stringify({
        response: reply,
        retrieval: {
          results_found: matches.length,
          retrieval_error: retrievalError,
          verification_required:
            verificationRequired,
        },
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    console.error(
      "LexAI Legal AI Error:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          "An unexpected error occurred while consulting the legal intelligence engine.",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
