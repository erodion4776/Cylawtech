import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-id, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TRIAL_LIMIT = 10;
const MAX_FOLLOWUP_QUESTIONS = 9;
const EMBEDDING_DIM = 384;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message: string, status = 500, details?: any) {
  return json({ error: message, details }, status);
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
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

function extractSectionReferences(query: string): string[] {
  const sections = new Set<string>();
  const regex = /\b(?:sections?|sec\.|s\.|articles?|art\.)\s*(\d+[A-Za-z]*)\b/gi;
  let match;
  while ((match = regex.exec(query)) !== null) sections.add(match[1].toUpperCase());
  return Array.from(sections);
}

async function createQueryEmbedding(query: string): Promise<number[]> {
  const model = new Supabase.ai.Session("gte-small");
  const result = await model.run(query.substring(0, 1000).replace(/\n/g, " "), {
    mean_pool: true, normalize: true,
  });
  return Array.from(result as Float32Array).map(Number);
}

// ============================================================
// USER STATUS & SUBSCRIPTION GATE
// ============================================================

interface UserStatus {
  used: number;
  limit: number;
  isSubscribed: boolean;
  tier: string;
}

async function getUserStatus(userId: string): Promise<UserStatus> {
  const { data } = await supabase
    .from("user_usage")
    .select("trial_messages_used, trial_limit, is_subscribed, subscription_tier, subscription_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabase.from("user_usage").insert({
      user_id: userId,
      trial_messages_used: 0,
      trial_limit: TRIAL_LIMIT,
      is_subscribed: false,
      subscription_tier: "free",
    });
    return { used: 0, limit: TRIAL_LIMIT, isSubscribed: false, tier: "free" };
  }

  let isActive = Boolean(data.is_subscribed);
  if (isActive && data.subscription_expires_at) {
    isActive = new Date(data.subscription_expires_at) > new Date();
  }

  return {
    used: data.trial_messages_used || 0,
    limit: data.trial_limit || TRIAL_LIMIT,
    isSubscribed: isActive,
    tier: data.subscription_tier || "free",
  };
}

async function incrementUsage(userId: string, isSubscribed: boolean): Promise<UserStatus> {
  const current = await getUserStatus(userId);
  if (isSubscribed) return current;
  if (current.used >= current.limit) return current;

  const newCount = current.used + 1;
  await supabase
    .from("user_usage")
    .update({ trial_messages_used: newCount, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { ...current, used: newCount };
}

// ============================================================
// INQUIRY INTERVIEW SESSIONS (ENGINE 1)
// ============================================================

interface InquirySession {
  id: string;
  conversation_id: string;
  original_question: string;
  questions_asked: number;
  facts_gathered: any[];
  final_analysis_delivered: boolean;
}

async function getActiveInquirySession(conversationId: string): Promise<InquirySession | null> {
  const { data } = await supabase
    .from("inquiry_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("final_analysis_delivered", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as InquirySession | null;
}

async function createInquirySession(userId: string, conversationId: string, originalQuestion: string, jurisdiction: string) {
  const { data } = await supabase
    .from("inquiry_sessions")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      original_question: originalQuestion,
      questions_asked: 0,
      facts_gathered: [],
      final_analysis_delivered: false,
      jurisdiction,
    })
    .select("*")
    .single();

  return data as InquirySession;
}

async function updateInquirySession(sessionId: string, questionsAsked: number, factsGathered: any[], delivered = false) {
  await supabase
    .from("inquiry_sessions")
    .update({
      questions_asked: questionsAsked,
      facts_gathered: factsGathered,
      final_analysis_delivered: delivered,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

// ============================================================
// CHAT HISTORY
// ============================================================

async function listConversations(userId: string) {
  const { data } = await supabase
    .from("conversations")
    .select("id, title, jurisdiction, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return data || [];
}

async function loadConversationHistory(conversationId: string) {
  const { data } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);
  return data || [];
}

async function saveMessage(conversationId: string, role: string, content: string) {
  await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function createConversation(userId: string, title: string, jurisdiction: string) {
  const { data } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title, jurisdiction })
    .select("id")
    .single();
  return data?.id || null;
}

async function deleteConversation(conversationId: string) {
  await supabase.from("inquiry_sessions").delete().eq("conversation_id", conversationId);
  await supabase.from("messages").delete().eq("conversation_id", conversationId);
  await supabase.from("conversations").delete().eq("id", conversationId);
}

// ============================================================
// VOICE TRANSCRIPTION (Groq Whisper)
// ============================================================

async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const groqKey = (Deno.env.get("GROQ_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!groqKey) return "[Voice transcription unavailable]";

  try {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    const ext = mimeType.includes("mp4") || mimeType.includes("aac") ? "m4a" : "webm";
    const blob = new Blob([bytes], { type: mimeType });
    const file = new File([blob], `voice.${ext}`, { type: mimeType });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "whisper-large-v3-turbo");

    const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (resp.ok) {
      const data = await resp.json();
      return data.text || "[Could not transcribe audio]";
    }
  } catch (e) {
    console.error("Transcription error:", e);
  }

  return "[Voice transcription failed]";
}

// ============================================================
// STATUTORY RETRIEVAL & CITATION URL BUILDER
// ============================================================

interface RetrievedChunk {
  id: string;
  content: string;
  section_number: string | null;
  subsection: string | null;
  source_locator: string;
  similarity: number;
  document_title?: string;
  jurisdiction?: string;
  current_status?: string;
  source_url?: string | null;
  url_template?: string | null;
}

function buildCitationUrl(chunk: RetrievedChunk): string | null {
  if (chunk.url_template && chunk.section_number) {
    return chunk.url_template.replace("{section}", chunk.section_number).replace("{subsection}", chunk.subsection || "");
  }
  if (chunk.source_url) {
    const base = chunk.source_url.replace(/#.*$/, "");
    return chunk.section_number ? `${base}#section-${chunk.section_number}` : base;
  }
  return null;
}

async function retrieveStatutoryContext(query: string, jurisdiction: string): Promise<RetrievedChunk[]> {
  const targetSections = extractSectionReferences(query);
  const results: RetrievedChunk[] = [];
  const seenIds = new Set<string>();

  if (targetSections.length > 0) {
    let q = supabase
      .from("knowledge_chunks")
      .select(`id, content, section_number, subsection, source_locator,
        documents!inner (title, jurisdiction, current_status, source_url, url_template, status)`)
      .in("section_number", targetSections)
      .eq("documents.status", "completed");

    if (jurisdiction !== "global") q = q.eq("documents.jurisdiction", jurisdiction);

    const { data } = await q.order("id", { ascending: true }).limit(6);
    if (data) {
      for (const item of data) {
        seenIds.add(item.id);
        const doc = Array.isArray(item.documents) ? item.documents[0] : item.documents;
        results.push({
          id: item.id, content: item.content,
          section_number: item.section_number, subsection: item.subsection,
          source_locator: item.source_locator, similarity: 1.0,
          document_title: doc?.title, jurisdiction: doc?.jurisdiction,
          current_status: doc?.current_status,
          source_url: doc?.source_url, url_template: doc?.url_template,
        });
      }
    }
  }

  try {
    const vector = await createQueryEmbedding(query);
    const { data } = await supabase.rpc("match_legal_chunks", {
      query_embedding: vector, match_threshold: 0.25, match_count: 6,
      filter_jurisdiction: jurisdiction === "global" ? null : jurisdiction,
    });

    if (Array.isArray(data)) {
      for (const item of data) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          results.push({
            id: item.id, content: item.content,
            section_number: item.section_number, subsection: item.subsection,
            source_locator: item.source_locator, similarity: item.similarity ?? 0.75,
            document_title: item.title, jurisdiction: item.jurisdiction,
            current_status: item.current_status,
            source_url: item.source_url, url_template: item.url_template,
          });
        }
      }
    }
  } catch (e) {
    console.warn("Vector fallback:", e);
  }

  return results.slice(0, 6);
}

// ============================================================
// INTENT DETECTION
// ============================================================

function detectQueryIntent(query: string, hasActiveSession: boolean): "statutory_lookup" | "advice_needed" | "skip_questions" {
  const lower = query.toLowerCase();
  if (hasActiveSession) return "advice_needed";

  if (lower.includes("skip questions") || lower.includes("just answer") || 
      lower.includes("general answer") || lower.includes("no follow-up") ||
      lower.includes("brief answer")) {
    return "skip_questions";
  }

  if (/^(what|define|explain|summarize|list).*(section|article|act|law|statute|rule)/i.test(query) ||
      /^(section|s\.|article|art\.)\s*\d+/i.test(query)) {
    return "statutory_lookup";
  }

  const adviceKeywords = [
    "can i", "should i", "what should", "what can", "advise", "advice",
    "my situation", "my case", "i was", "i am", "i have", "my client",
    "sued", "arrested", "charged", "contract", "divorce", "custody",
    "liability", "damages", "sentenced", "fired", "dismissed",
    "agreement", "dispute", "owe", "owed", "evicted", "landlord",
    "tenant", "accident", "injured", "injury", "will", "estate",
    "problem", "issue", "complaint", "help me", "visa", "green card", "deport"
  ];

  return adviceKeywords.some(k => lower.includes(k)) ? "advice_needed" : "statutory_lookup";
}

// ============================================================
// LLM INFERENCE ENGINE
// ============================================================

async function generateAnswer(
  systemPrompt: string,
  userContent: string | Array<any>,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  const groqKey = (Deno.env.get("GROQ_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  const openAiKey = (Deno.env.get("OPENAI_API_KEY") || "").trim().replace(/^["']|["']$/g, "");

  if (!groqKey && !openAiKey) throw new Error("Missing GROQ_API_KEY in Supabase Secrets.");

  const sanitizedHistory = (history || [])
    .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-10)
    .map((m: any) => ({ role: m.role, content: String(m.content) }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...sanitizedHistory,
    { role: "user", content: userContent },
  ];

  const errors: string[] = [];

  if (groqKey) {
    const isVision = Array.isArray(userContent) && userContent.some((c: any) => c.type === "image_url");
    const models = isVision
      ? ["llama-3.2-90b-vision-preview", "llama-3.2-11b-vision-preview"]
      : ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

    for (const model of models) {
      try {
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 3000 }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
        }

        const errText = await resp.text();
        errors.push(`[Groq ${model} (${resp.status})]: ${errText}`);
      } catch (err: any) {
        errors.push(`[Groq ${model}]: ${err.message}`);
      }
    }
  }

  if (openAiKey) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.1, max_tokens: 3000 }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
      }
    } catch (e: any) {
      errors.push(`[OpenAI]: ${e.message}`);
    }
  }

  throw new Error(`LLM Generation Failed:\n${errors.join("\n")}`);
}

// ============================================================
// SYSTEM PROMPTS (ANTI-OUTDATED-LAW & THREE-ENGINE MODEL)
// ============================================================

const CURRENT_DATE_STRING = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function buildStatutorySystemPrompt(jurisdiction: string): string {
  return `You are LexAI, an authoritative statutory intelligence assistant for ${jurisdiction.toUpperCase()} law.

CORE TRAINING DIRECTIVES:
1. MODEL MEMORY IS NOT PROOF OF CURRENT LAW. Rely strictly on the STATUTORY CONTEXT below.
2. NEVER FABRICATE statutes, section numbers, regulations, court decisions, filing deadlines, or fees.
3. CITATION PRECISION: Always cite exact Act/Title numbers and sections.
4. DATE STAMP: When verified primary sources are present, append at the end:
   *Law checked as of: ${CURRENT_DATE_STRING}*`;
}

function buildFollowUpSystemPrompt(jurisdiction: string, questionNumber: number, originalQuestion: string): string {
  return `You are LexAI, an elite legal interview engine practicing ${jurisdiction.toUpperCase()} law.

CORE INTERVIEW PHILOSOPHY (Part II of Training Manual):
- The client provides facts and documents. The AI performs issue spotting, jurisdiction analysis, and legal research.
- ASK FACTS, NOT LAW: Never ask the client what law applies, what section governs, or what cause of action exists.
- ASK ONLY MATERIAL QUESTIONS: Each question must directly affect liability, defenses, jurisdiction, limitation periods, or remedies.
- PROBE VAGUE STATEMENTS: If client mentions threats, discrimination, breach, or damages, ask for specific underlying conduct, dates, and evidence.

INTERVIEW POSTURE:
The client's original legal issue: "${originalQuestion}"
This is Question ${questionNumber} of ${MAX_FOLLOWUP_QUESTIONS}. (${MAX_FOLLOWUP_QUESTIONS - questionNumber} questions remaining).

INSTRUCTIONS:
1. Acknowledge the user's latest response in 1 brief, empathetic sentence.
2. Formulate exactly ONE targeted, neutral factual question to gather missing critical information.
3. Progressively cover:
   - Specific conduct (what was said, done, signed, or omitted)
   - Dates, timeline, and notice received
   - Physical location / State jurisdiction
   - Available evidence (contracts, receipts, emails, audio, witnesses)
   - Adverse facts (what the opposing party will claim)
   - Practical objective sought by the user

FORMAT YOUR RESPONSE:
### Factual Clarification
<1-sentence acknowledgment of latest fact>

### Follow-up Question ${questionNumber} of ${MAX_FOLLOWUP_QUESTIONS}
**<Your single material factual question here>**

*(Why this is legally significant):* <1-sentence explanation of why this fact impacts the statutory analysis>

---
*Type "skip questions" at any time to receive a preliminary general summary.*

DO NOT provide the final legal opinion yet.`;
}

function buildFinalSubscribedPrompt(jurisdiction: string, factsSummary: string): string {
  return `You are LexAI, a senior legal counsel specializing in ${jurisdiction.toUpperCase()} law.

You have concluded a comprehensive 9-stage fact-gathering interview. Deliver a fully grounded, element-by-element legal opinion.

FACTUAL RECORD GATHERED:
${factsSummary}

REQUIRED 10-SECTION OPINION STRUCTURE:

### 1. Your Situation & Factual Matrix
<Concise distillation of established facts, material timeline, and adverse facts>

### 2. Precise Legal Issues
<Specific legal determinations required>

### 3. Current Controlling Law
<Verified primary authority from STATUTORY CONTEXT with exact section citations>

### 4. Element-by-Element Application
<Detailed analysis mapping specific facts to each legal element>

### 5. Strengths of Your Position
<Facts and rules supporting the client>

### 6. Risks, Counterarguments & Adverse Claims
<Opposing party's defenses, procedural hurdles, and weak points>

### 7. Strategic Options & Remedies
<Comparison of lawful pathways: negotiation, mediation, litigation, administrative filing>

### 8. Critical Deadlines & Procedural Prerequisites
<Statutory limitation periods, notice requirements, court of competent jurisdiction>

### 9. Preliminary Conclusion
<Calibrated supported conclusion>

### 10. Actionable Next Steps & Evidence Preservation
<Concrete steps the client should take immediately>

---
### Verification Status
**VERIFIED** — Primary statutory sources evaluated.
*Law checked as of: ${CURRENT_DATE_STRING}*`;
}

function buildFinalFreeTierPrompt(jurisdiction: string, factsSummary: string): string {
  return `You are LexAI, a legal intelligence assistant practicing ${jurisdiction.toUpperCase()} law.

You have gathered facts from a FREE TIER user. Provide a concise, high-level summary (under 400 words) and present the upgrade gate for full legal analysis.

FACTS GATHERED:
${factsSummary}

REQUIRED FORMAT:

### Summary of Legal Position
<Brief 3-4 sentence overview of the legal framework under ${jurisdiction.toUpperCase()} law, referencing applicable statutes by name only>

### Key Legal Issues Identified
- <Issue 1>
- <Issue 2>
- <Issue 3>

### 🔒 Complete Legal Analysis Required
Your matter contains complex factual elements and potential time-sensitive procedural deadlines. To unlock your full 10-section legal opinion, upgrade to **LexAI Counsel**:

**Included in Full Opinion:**
- ✓ Exact statutory citations and subsection breakdown
- ✓ Element-by-element application to your specific facts
- ✓ Adverse party counter-analysis and risk assessment
- ✓ Step-by-step procedural roadmap and limitation deadlines
- ✓ Strategic recommendations and evidence checklist

[**→ Unlock Full Legal Analysis**](/contact)

---
*Law checked as of: ${CURRENT_DATE_STRING}*
*LexAI provides legal information, not formal attorney representation.*`;
}

// ============================================================
// MAIN HTTP DISPATCHER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("user_id") || "";

    if (action === "list" && userId) {
      const conversations = await listConversations(userId);
      const status = await getUserStatus(userId);
      return json({ conversations, usage: status });
    }

    if (action === "history" && req.method === "POST") {
      const body = await req.json();
      const messages = await loadConversationHistory(body.conversation_id);
      return json({ messages });
    }

    if (action === "delete" && req.method === "POST") {
      const body = await req.json();
      await deleteConversation(body.conversation_id);
      return json({ success: true });
    }

    const body = await req.json().catch(() => null);
    if (!body) return errorResponse("Invalid request payload.", 400);

    const userMessage = cleanString(body.message);
    const attachment = body.attachment || null;
    const chatUserId = body.user_id || userId;
    const jurisdiction = normalizeJurisdiction(body.jurisdiction);
    const history = Array.isArray(body.history) ? body.history : [];

    const userStatus = chatUserId && chatUserId !== "authenticated_user"
      ? await getUserStatus(chatUserId)
      : { used: 0, limit: TRIAL_LIMIT, isSubscribed: false, tier: "free" };

    if (!userStatus.isSubscribed && userStatus.used >= userStatus.limit) {
      return json({
        paywall: true,
        error: `You have completed all ${TRIAL_LIMIT} free trial messages. Upgrade for unlimited legal analysis.`,
        usage: userStatus,
      });
    }

    let fullUserText = userMessage;
    let transcription = "";
    let userContentForLLM: string | Array<any> = "";
    let hasAttachment = false;

    if (attachment) {
      hasAttachment = true;
      if (attachment.type === "audio" && attachment.base64) {
        transcription = await transcribeAudio(attachment.base64, attachment.mimeType);
        fullUserText = transcription + (userMessage ? `\n\n${userMessage}` : "");
      } else if (attachment.type === "pdf" && attachment.extractedText) {
        fullUserText = userMessage + `\n\n--- EXTRACTED PDF CONTENT ---\n${attachment.extractedText.substring(0, 8000)}`;
      } else if (attachment.type === "text" && attachment.extractedText) {
        fullUserText = userMessage + `\n\n--- EXTRACTED DOCUMENT ---\n${attachment.extractedText.substring(0, 8000)}`;
      } else if (attachment.type === "image" && attachment.base64) {
        userContentForLLM = [
          { type: "text", text: fullUserText || "Analyze this legal document or photo." },
          { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64}` } },
        ];
      }
    }

    // Vision Analysis
    if (Array.isArray(userContentForLLM)) {
      const systemPrompt = `You are LexAI Vision. Analyze the attached legal document, contract, or pleading. Identify key clauses, parties, dates, signatures, and risks.`;
      const answer = await generateAnswer(systemPrompt, userContentForLLM, history);

      let convId = body.conversation_id;
      if (chatUserId && chatUserId !== "authenticated_user") {
        if (!convId) convId = await createConversation(chatUserId, "Document Vision Audit", jurisdiction);
        if (convId) {
          await saveMessage(convId, "user", fullUserText || "[Document/Image Uploaded]");
          await saveMessage(convId, "assistant", answer);
        }
        const updated = await incrementUsage(chatUserId, userStatus.isSubscribed);
        return json({
          success: true, answer, conversation_id: convId, citations: [],
          transcription: transcription || undefined, usage: updated,
        });
      }

      return json({
        success: true, answer, conversation_id: null, citations: [],
        transcription: transcription || undefined, usage: userStatus,
      });
    }

    let convId = body.conversation_id;
    if (chatUserId && chatUserId !== "authenticated_user" && !convId) {
      convId = await createConversation(chatUserId, fullUserText.substring(0, 60), jurisdiction);
    }

    let activeSession: InquirySession | null = null;
    if (convId) {
      activeSession = await getActiveInquirySession(convId);
    }

    const intent = hasAttachment ? "statutory_lookup" : detectQueryIntent(fullUserText, Boolean(activeSession));

    // Retrieve statutory context
    const chunks = await retrieveStatutoryContext(
      activeSession?.original_question || fullUserText,
      jurisdiction
    );
    const contextPayload = chunks.length > 0
      ? chunks.map((c, i) => `--- AUTHORITY [${i + 1}] ---\nDOCUMENT: ${c.document_title}\nSECTION: ${c.section_number || "General"}\nTEXT:\n${c.content.substring(0, 1000)}`).join("\n\n")
      : "No indexed statutory provisions found.";

    let systemPrompt: string;
    let answer: string;
    let shouldDeliverFinal = false;

    // ============================================================
    // 9-STAGE FACT GATHERING INTERVIEW (ENGINE 1 -> ENGINE 3)
    // ============================================================
    if (intent === "advice_needed" && convId) {
      if (!activeSession && chatUserId && chatUserId !== "authenticated_user") {
        activeSession = await createInquirySession(chatUserId, convId, fullUserText, jurisdiction);
      }

      const questionsAsked = activeSession?.questions_asked || 0;
      const factsGathered = activeSession?.facts_gathered || [];

      if (questionsAsked > 0 && activeSession) {
        factsGathered.push({
          question_number: questionsAsked,
          user_response: fullUserText,
          timestamp: new Date().toISOString(),
        });
      }

      const nextQuestionNumber = questionsAsked + 1;

      // Check if 9 questions completed -> Deliver final advice
      if (questionsAsked >= MAX_FOLLOWUP_QUESTIONS) {
        shouldDeliverFinal = true;

        const factsSummary = [
          `Original Issue: ${activeSession?.original_question || fullUserText}`,
          ...factsGathered.map((f: any, i: number) => `Fact ${i + 1}: ${f.user_response}`),
          `Latest Response: ${fullUserText}`,
        ].join("\n\n");

        if (userStatus.isSubscribed) {
          systemPrompt = buildFinalSubscribedPrompt(jurisdiction, factsSummary);
        } else {
          systemPrompt = buildFinalFreeTierPrompt(jurisdiction, factsSummary);
        }

        userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nRECORD OF GATHERED FACTS:\n${factsSummary}\n\nFINAL RESPONSE:\n${fullUserText}`;
        answer = await generateAnswer(systemPrompt, userContentForLLM, history);

        if (activeSession) {
          await updateInquirySession(activeSession.id, questionsAsked, factsGathered, true);
        }
      } else {
        // Ask Next Progressive Follow-Up Question
        systemPrompt = buildFollowUpSystemPrompt(
          jurisdiction,
          nextQuestionNumber,
          activeSession?.original_question || fullUserText
        );

        userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nFACTS GATHERED SO FAR:\n${JSON.stringify(factsGathered, null, 2)}\n\nUSER'S LATEST MESSAGE:\n${fullUserText}`;
        answer = await generateAnswer(systemPrompt, userContentForLLM, history);

        if (activeSession) {
          await updateInquirySession(activeSession.id, nextQuestionNumber, factsGathered, false);
        }
      }
    } else {
      // Direct Statutory Lookup
      systemPrompt = buildStatutorySystemPrompt(jurisdiction);
      userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nUSER INQUIRY:\n${fullUserText}`;
      answer = await generateAnswer(systemPrompt, userContentForLLM, history);
    }

    // Persist messages & increment usage
    if (chatUserId && chatUserId !== "authenticated_user" && convId) {
      await saveMessage(convId, "user", fullUserText);
      await saveMessage(convId, "assistant", answer);
      const updated = await incrementUsage(chatUserId, userStatus.isSubscribed);

      const citations = (chunks || []).map((c) => ({
        text: c.section_number ? `Section ${c.section_number} — ${c.document_title || "Statute"}` : c.source_locator,
        url: buildCitationUrl(c),
        section: c.section_number ? `Section ${c.section_number}` : null,
        subsection: c.subsection,
        status: c.current_status || "verified",
        similarity: Number((c.similarity || 0).toFixed(3)),
      }));

      return json({
        success: true,
        answer,
        conversation_id: convId,
        citations,
        transcription: transcription || undefined,
        usage: updated,
        inquiry_status: activeSession ? {
          questions_asked: shouldDeliverFinal ? MAX_FOLLOWUP_QUESTIONS : (activeSession.questions_asked + 1),
          questions_remaining: shouldDeliverFinal ? 0 : (MAX_FOLLOWUP_QUESTIONS - activeSession.questions_asked - 1),
          final_delivered: shouldDeliverFinal,
          is_subscribed: userStatus.isSubscribed,
        } : null,
      });
    }

    const citations = (chunks || []).map((c) => ({
      text: c.section_number ? `Section ${c.section_number} — ${c.document_title || "Statute"}` : c.source_locator,
      url: buildCitationUrl(c),
      section: c.section_number ? `Section ${c.section_number}` : null,
      subsection: c.subsection,
      status: c.current_status || "verified",
      similarity: Number((c.similarity || 0).toFixed(3)),
    }));

    return json({
      success: true,
      answer,
      conversation_id: convId,
      citations,
      transcription: transcription || undefined,
      usage: userStatus,
    });
  } catch (error: any) {
    console.error("Chat Error:", error);
    return errorResponse(error?.message || "Chat service error", 500);
  }
});
