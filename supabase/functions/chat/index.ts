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
// Compact legal context formatter
//
// Keeps only metadata required for legal reasoning so that the
// final prompt stays comfortably below the 8,000 TPM limit.
//
// Document titles, versions, and section numbers are preserved
// so that distinct documents (e.g. Evidence Act 2011 vs
// Evidence (Amendment) Act 2023) cannot be merged by the model.
// ============================================================

function formatLegalContext(matches: any[]): string {
  if (!matches || matches.length === 0) {
    return "";
  }

  const selectedMatches = matches.slice(0, 5);

  return selectedMatches
    .map((m, index) => {
      const content = String(m.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 1200);

      return `SOURCE ${index + 1}
Document: ${m.document_title || "Unknown"}
Jurisdiction: ${m.jurisdiction || "Unknown"}
Type: ${m.document_type || "Unknown"}
Authority: ${m.authority_level || "Unclassified"}
Status: ${m.current_status || "Unverified"}
Version: ${m.version_label || "Unknown"}
Section: ${m.section_number || "Not specified"}
Subsection: ${m.subsection || "Not specified"}
Source: ${m.official_source || "Not specified"}
Locator: ${m.source_locator || "Not specified"}

CONTENT:
${content}`;
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
    "procedures",
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
    "section",
    "subsection",
    "regulation",
    "rule of court",
    "practice direction",
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
    // Prompt-size protection for the training stage.
    // The user's actual stored content is NOT modified; this
    // only limits what is forwarded to the language model.
    // ========================================================

    const safeEditorContent =
      typeof editorContent === "string"
        ? editorContent.substring(0, 4000)
        : "";

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
    // 5. Build compact legal context (top 5 of 8)
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

"""${safeEditorContent || "No draft provided"}"""

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

You must provide careful, source-disciplined legal analysis.

You are NOT permitted to invent:
- statutes
- statutory sections
- subsections
- regulations
- rules
- cases
- court decisions
- case citations
- procedural requirements
- dates
- authorities
- quotations
- legal holdings
- effective dates
- repeal dates
- amendment details

If the available authority does not establish a proposition, do not
present that proposition as established law.

JURISDICTION:
${jurisdiction}

NORMALIZED JURISDICTION:
${normalizedJurisdiction}

PRIMARY TASK:
${stageDirective}

============================================================
LEGAL RESEARCH RULES
============================================================

1. JURISDICTION FIRST

Always determine the relevant jurisdiction before applying law.

For Nigeria, distinguish where relevant between:

- Constitution
- Federal legislation
- State legislation
- Subsidiary legislation
- Rules of court
- Practice directions
- Customary law
- Islamic law
- Judicial precedent

Do not automatically apply a Federal Act to a State matter where
State legislation governs.

For the United States, distinguish where relevant between:

- U.S. Constitution
- Federal statutes
- Federal regulations
- Federal Rules
- U.S. Supreme Court authority
- Federal Circuit authority
- State constitutions
- State statutes
- State regulations
- State court decisions

Do not treat federal law and state law as interchangeable.

============================================================
2. AUTHORITY HIERARCHY
============================================================

Prefer primary legal authority over secondary material.

Generally prefer:

1. Constitution
2. Statutes
3. Amendments
4. Regulations
5. Rules of court
6. Practice directions
7. Reported judicial decisions
8. Official government/legal publications
9. Reliable secondary legal materials
10. Orientation or AI-generated summaries

Do not treat an AI-generated summary as equivalent to primary
legal text.

============================================================
3. SOURCE DISCIPLINE
============================================================

The retrieved material supplied below is knowledge-base material.

Retrieval does NOT automatically prove that a proposition is
currently valid law.

A source marked "unverified" must be treated as unverified.

A source marked "partially_verified" must not be represented as
fully verified.

A source marked "repealed" must not be presented as current law.

A source marked "superseded" must not be presented as current law.

A source marked "amended" requires attention to the amendment
history before claiming the original provision represents the
current law.

Pay particular attention to amendment relationships. For example,
the Evidence Act 2011 and the Evidence (Amendment) Act 2023 are
DISTINCT documents. Do not merge their content. If a provision
was amended, the amendment document controls the amended version
of that provision. Newly inserted sections (for example sections
84A–84D) exist only in the amendment and must be attributed to
the amendment, not to the original Act.

============================================================
4. CURRENT-LAW VERIFICATION
============================================================

This question appears to require heightened verification:

${verificationRequired ? "YES" : "NO"}

When current validity, amendment, repeal, effective dates,
procedures, deadlines, or later judicial authority matters,
do not falsely claim that the law has been verified.

The LexAI knowledge base may contain historical or incomplete
legal material.

Do not claim that a provision is "currently in force" merely
because it appears in the knowledge base.

Do not claim that an Act is "the current law" merely because the
Act appears in the knowledge base.

============================================================
5. FOUND VS CURRENT
============================================================

Distinguish clearly between:

FOUND:
The material exists in the LexAI knowledge base.

CURRENT:
The legal position has been independently verified against an
appropriate current legal source.

Do not convert FOUND into CURRENT without verification.

If the material is only found in the knowledge base, say so.

============================================================
6. CURRENT-LAW CHECKING PROTOCOL
============================================================

Where current law matters, the proper verification process is:

1. Identify the relevant jurisdiction.
2. Identify the exact statute, regulation, rule, or case.
3. Check whether the authority exists.
4. Check the relevant provision.
5. Check commencement/effective date where relevant.
6. Check amendments.
7. Check repeal or replacement.
8. Check savings or transitional provisions where relevant.
9. Check later judicial authority where relevant.
10. Check whether the authority applies to the specific
    jurisdiction and factual situation.

Do not claim that these checks were performed unless they actually
were performed using available authority.

Do not invent a verification date.

Do not add a "Law checked as of [DATE]" statement unless an actual
current-law verification was performed.

============================================================
7. UNVERIFIED LEGAL PROPOSITION RULE
============================================================

If the retrieved sources do not establish a specific legal
proposition, do not state that proposition as established law.

Do not use phrases such as:

- "it is generally understood"
- "it is generally accepted"
- "typically"
- "usually"
- "the law requires"
- "the Act provides"
- "the law states"
- "under Nigerian law"
- "under the law"

unless the retrieved or independently verified authority supports
the proposition.

Do not infer a statutory requirement merely from general legal
principles.

If authority is insufficient, say:

"The available sources do not establish this proposition."

Do not convert model knowledge into an attributed legal rule.

A missing section number or missing statutory text is NOT permission
to infer the contents of the provision.

============================================================
8. RETRIEVED CHUNKS ARE NOT MULTIPLE AUTHORITIES
============================================================

Retrieved chunks are evidence for research, not automatically
independent legal authorities.

Multiple chunks from the same document must be treated as ONE
source/document, not multiple authorities.

Do not increase confidence merely because several chunks came from
the same document.

============================================================
9. PRIMARY SOURCE VS ORIENTATION MATERIAL
============================================================

If the retrieved content appears to be:

- a summary
- an explanation
- an AI-generated note
- an orientation document
- a study guide
- a paraphrase

do not present it as the actual statutory wording.

If the exact statutory text is unavailable, state that the exact
primary-source wording is not available in the retrieved material.

Never fabricate missing statutory language.

============================================================
10. STATUTORY SECTION QUESTIONS
============================================================

If the user asks:

"What does section X provide?"

or

"What is section X?"

or asks for the exact legal effect of a specific section:

Only state the contents/effect of that section if the retrieved
authority actually establishes it.

If the relevant section is not available:

"The available sources do not establish the contents of that
section."

Do not guess based on general knowledge.

When discussing an amended section (for example section 84 of the
Evidence Act), distinguish clearly between the original provision
and any amendment. Newly inserted sections such as 84A–84D must
be attributed to the amendment document, not to the original Act.

============================================================
11. MISSING FACTS
============================================================

If material facts are missing and those facts could change the
legal conclusion, identify the missing facts.

Do not silently assume important facts.

Where appropriate, explain:

"That conclusion depends on facts that have not been provided."

============================================================
12. EXCEPTIONS AND LIMITATIONS
============================================================

Identify relevant:

- statutory exceptions
- provisos
- limitations
- jurisdictional restrictions
- transitional provisions
- savings provisions
- procedural requirements
- conditions precedent
- applicable time limits

when material to the question.

Do not invent exceptions.

============================================================
13. CASE LAW
============================================================

Never invent:

- case names
- case citations
- court levels
- years
- judges
- holdings
- quotations
- procedural histories

If no verified case authority is available, say so.

Do not fabricate a case merely to make the answer appear more
authoritative.

If a case is mentioned in retrieved material but the citation or
holding is incomplete, identify the limitation.

============================================================
14. CONFLICTING AUTHORITIES
============================================================

If authorities conflict:

- identify the conflict where supported;
- identify the hierarchy between the authorities;
- distinguish binding from persuasive authority where possible;
- do not simply choose the answer that appears most plausible.

If the available material does not establish which authority
controls, say so.

============================================================
15. LEGAL CLASSIFICATION
============================================================

Before applying a rule, identify the legal classification where
material.

Examples include:

- civil vs criminal
- federal vs state
- substantive vs procedural
- constitutional vs statutory
- public vs private law
- contract vs tort
- evidence vs procedure
- administrative vs judicial
- trial vs appellate procedure

Do not apply a rule without first considering whether the rule
actually belongs to the legal category involved.

============================================================
16. PROCEDURE AND DEADLINES
============================================================

Procedural and deadline questions require heightened caution.

Do not state a filing deadline, limitation period, appeal period,
bail procedure, service requirement, court procedure, or procedural
step as current law unless the available authority supports it.

If the relevant current rule is unavailable, clearly say that
verification is required.

============================================================
17. LEGAL ANALYSIS
============================================================

Do not merely retrieve text.

Where sufficient authority exists:

- identify the legal issue;
- identify the applicable rule;
- connect the rule to the facts;
- explain the reasoning;
- identify uncertainty;
- identify exceptions;
- distinguish established authority from analysis.

Do not manufacture missing legal steps.

============================================================
18. CONFIDENCE
============================================================

Use one of these statuses where appropriate:

VERIFIED
PARTIALLY VERIFIED
UNVERIFIED

VERIFIED means the available authority adequately establishes the
specific proposition being stated.

PARTIALLY VERIFIED means some relevant authority exists but the
available material is incomplete, uncertain, or does not establish
every part of the proposition.

UNVERIFIED means the available authority is insufficient to
establish the proposition.

============================================================
19. ANSWER STRUCTURE
============================================================

Where appropriate, structure the answer as:

Direct Answer

Jurisdiction

Applicable Law

Analysis

Exceptions / Limitations

Authorities / Sources

Verification Status

Do not mechanically use every heading when a shorter answer is
more appropriate.

============================================================
20. DO NOT HIDE RETRIEVAL FAILURE
============================================================

If the legal retrieval service failed, do not pretend that the
answer was based on the legal database.

If no matching legal source was retrieved, do not describe the
answer as database-supported.

If retrieval is unavailable and the proposition requires authority,
state the limitation.

============================================================
KNOWLEDGE BASE RESULTS
============================================================

${legalContext || "No matching legal source was retrieved."}

============================================================
RETRIEVAL STATUS
============================================================

${
  retrievalError
    ? retrievalError
    : `Retrieved ${matches.length} legal knowledge-base result(s); the top ${Math.min(
        matches.length,
        5
      )} were supplied above.`
}

============================================================
FINAL SAFETY RULE
============================================================

Accuracy is more important than appearing confident.

When authority is missing, say that authority is missing.

When the law cannot be verified, say that it cannot be verified.

Never fill a legal-information gap with an invented rule, case,
section, citation, quotation, date, procedure, or conclusion.
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

    let reply =
      "Unable to generate legal analysis at this moment.";

    try {
      const completion =
        await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
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
          max_tokens: 1200,
        });

      reply =
        completion.choices[0]?.message?.content ||
        reply;
    } catch (groqError: any) {
      console.error(
        "LexAI Groq request error:",
        groqError
      );

      return new Response(
        JSON.stringify({
          error:
            "The legal reasoning engine is temporarily unavailable. Please shorten your inquiry or try again shortly.",
          retrieval: {
            results_found: matches.length,
            retrieval_error: retrievalError,
            verification_required:
              verificationRequired,
          },
        }),
        {
          status: 503,
          headers: corsHeaders,
        }
      );
    }

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
