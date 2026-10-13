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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
// USAGE & SUBSCRIPTION TRACKING
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

  // Check subscription expiry
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

  // Subscribed users bypass the trial counter
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
// INQUIRY SESSION TRACKING (9 FOLLOW-UP QUESTIONS)
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

async function createInquirySession(userId: string, conversationId: string, originalQuestion: string) {
  const { data } = await supabase
    .from("inquiry_sessions")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      original_question: originalQuestion,
      questions_asked: 0,
      facts_gathered: [],
      final_analysis_delivered: false,
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
// CHAT HISTORY CRUD
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
  await supabase.from("messages").insert({
    conversation_id: conversationId, role, content,
  });
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
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
// STATUTORY RETRIEVAL
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
    "problem", "issue", "complaint", "complaining", "help me"
  ];

  if (adviceKeywords.some(k => lower.includes(k))) {
    return "advice_needed";
  }

  return "statutory_lookup";
}

// ============================================================
// LLM GENERATION
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

  throw new Error(`LLM Failed:\n${errors.join("\n")}`);
}

// ============================================================
// PROMPT BUILDERS
// ============================================================

function buildStatutorySystemPrompt(jurisdiction: string): string {
  return `You are LexAI, an authoritative statutory intelligence assistant for ${jurisdiction.toUpperCase()} law.

RULES:
1. STRICT GROUNDING: Base answers strictly on the STATUTORY CONTEXT provided.
2. Use structured bullet points.
3. Always conclude completely. Never end mid-sentence.
4. Include every relevant subsection from the context.`;
}

function buildFollowUpSystemPrompt(jurisdiction: string, questionNumber: number, originalQuestion: string): string {
  return `You are LexAI, a professional legal advisor practicing ${jurisdiction.toUpperCase()} law.

CRITICAL FACT-GATHERING PROTOCOL:
You are in the middle of a structured interview with the user. The user's original legal issue is:
"${originalQuestion}"

This is follow-up question ${questionNumber} of ${MAX_FOLLOWUP_QUESTIONS}. You have ${MAX_FOLLOWUP_QUESTIONS - questionNumber} questions remaining before you must provide final advice.

INSTRUCTIONS:
1. Acknowledge the user's latest answer in 1 brief sentence.
2. Based on their answer so far, ask ONE focused next question to gather critical missing information.
3. The question should progressively narrow down into:
   - Parties involved (names, roles, relationships)
   - Timeline (dates of key events, duration of issues)
   - Jurisdiction specifics (state, court, authority involved)
   - Documents and evidence (contracts, notices, receipts, witnesses)
   - Prior actions taken (reports, complaints, legal correspondence)
   - Outcome sought (compensation, injunction, criminal charges, settlement)
   - Current stage of the matter
   - Opposing party's position
   - Any special circumstances (minors, disability, emergencies, deadlines)

Format your response as:

### Thank You for That Detail
<Brief 1-sentence acknowledgment>

### Follow-up Question ${questionNumber} of ${MAX_FOLLOWUP_QUESTIONS}
<Your single focused question here>

**(Why I'm asking):** <Brief 1-sentence reason this fact matters for your legal analysis>

---
*You can type "skip questions" at any time to receive a general answer with limited specificity.*

DO NOT provide legal advice yet. Only ask the next question.`;
}

function buildFinalSubscribedPrompt(jurisdiction: string, factsSummary: string): string {
  return `You are LexAI, an elite legal advisor practicing ${jurisdiction.toUpperCase()} law.

You have completed a thorough fact-gathering interview. Now provide a COMPLETE, DETAILED, PROFESSIONAL LEGAL ANALYSIS.

FACTS GATHERED FROM USER:
${factsSummary}

STRUCTURE YOUR FINAL ANALYSIS:

### Executive Summary
<2-3 sentence overview of the legal position>

### Jurisdiction & Applicable Law
<State the exact jurisdiction, applicable statute(s), and section numbers from STATUTORY CONTEXT>

### Detailed Legal Analysis
<Comprehensive multi-paragraph analysis connecting each fact to the applicable law. Address each legal issue separately. Cite exact section numbers.>

### Rights and Obligations of Each Party
<Clearly outline what each party is legally entitled to and obligated to do>

### Procedural Steps Required
<Step-by-step procedural guidance, including filing deadlines, courts of competent jurisdiction, required documents, and service requirements>

### Likely Outcomes and Risk Assessment
<Realistic assessment of possible outcomes including best case, worst case, and most likely scenario>

### Strategic Recommendations
<Practical, actionable guidance tailored to the user's specific circumstances>

### Required Documentation
<List all documents the user needs to prepare or obtain>

### Deadlines and Time-Sensitive Actions
<Any statutory deadlines, limitation periods, or urgent actions required>

### Alternative Options
<Any out-of-court settlement, mediation, arbitration, or alternative dispute resolution options>

### Verification Status
<VERIFIED based on cited statutory authorities>

RULES:
- Base ALL legal reasoning strictly on the STATUTORY CONTEXT and gathered facts.
- Never fabricate case names, sections, or quotations.
- Always cite exact section numbers.
- Finish your analysis completely without cutting off.`;
}

function buildFinalFreeTierPrompt(jurisdiction: string, factsSummary: string): string {
  return `You are LexAI, a legal advisor practicing ${jurisdiction.toUpperCase()} law.

You have completed fact-gathering with a FREE TIER user. Provide a BRIEF SUMMARY ONLY, then prompt them to upgrade for the full detailed analysis.

FACTS GATHERED FROM USER:
${factsSummary}

STRUCTURE YOUR SUMMARY:

### Preliminary Summary of Your Legal Position
<3-4 sentence overview identifying the main legal issue and general position under ${jurisdiction.toUpperCase()} law. Reference the applicable statute by name only.>

### Key Legal Issues Identified
<Short bulleted list of 3-4 key legal issues in the user's situation. One line each.>

### What's Included in Your Full Analysis (Upgrade Required)
<Brief 1-sentence description of each of these:
- Detailed statutory analysis with exact section numbers
- Rights and obligations of each party
- Step-by-step procedural guidance
- Deadlines and time-sensitive actions
- Required documentation
- Likely outcomes and risk assessment
- Strategic recommendations tailored to your case
- Alternative dispute resolution options>

### 🔒 Unlock Full Legal Analysis
Your situation requires detailed legal analysis to protect your interests. Upgrade to **LexAI Premium** to receive:
- ✓ Complete statutory analysis with citations
- ✓ Full procedural roadmap and deadlines
- ✓ Rights, obligations, and strategic recommendations
- ✓ Unlimited inquiries and document reviews
- ✓ Priority access to legal verification

[**→ Upgrade to Premium**](/contact)

---

*LexAI provides legal information, not legal representation. Verify crucial legal steps with qualified counsel.*

RULES:
- Keep the summary brief (under 400 words total).
- Mention the applicable statute by name but DO NOT provide specific section numbers or detailed analysis.
- Make the upgrade value clear without being pushy.
- Base the summary strictly on the STATUTORY CONTEXT and gathered facts.`;
}

// ============================================================
// MAIN DISPATCHER
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
    if (!body) return errorResponse("Invalid request.", 400);

    const userMessage = cleanString(body.message);
    const attachment = body.attachment || null;
    const chatUserId = body.user_id || userId;
    const jurisdiction = normalizeJurisdiction(body.jurisdiction);
    const history = Array.isArray(body.history) ? body.history : [];

    // Status check
    const userStatus = chatUserId && chatUserId !== "authenticated_user"
      ? await getUserStatus(chatUserId)
      : { used: 0, limit: TRIAL_LIMIT, isSubscribed: false, tier: "free" };

    // Trial limit enforcement (only for non-subscribers)
    if (!userStatus.isSubscribed && userStatus.used >= userStatus.limit) {
      return json({
        paywall: true,
        error: `You have used all ${TRIAL_LIMIT} free trial messages. Upgrade for unlimited access.`,
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
          { type: "text", text: fullUserText || "Analyze this image and describe any legal documents, contracts, or text visible." },
          { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64}` } },
        ];
      }
    }

    // VISION MODE
    if (Array.isArray(userContentForLLM)) {
      const systemPrompt = `You are LexAI, a legal document analysis assistant. Analyze the attached image carefully. If it contains a legal document, contract, or statutory text, identify key clauses, parties, dates, obligations, and potential legal issues. Provide structured analysis.`;
      const answer = await generateAnswer(systemPrompt, userContentForLLM, history);

      let convId = body.conversation_id;
      if (chatUserId && chatUserId !== "authenticated_user") {
        if (!convId) convId = await createConversation(chatUserId, "Image Analysis", jurisdiction);
        if (convId) {
          await saveMessage(convId, "user", fullUserText || "[Image attached]");
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

    // Load or create conversation ID
    let convId = body.conversation_id;
    if (chatUserId && chatUserId !== "authenticated_user" && !convId) {
      convId = await createConversation(chatUserId, fullUserText.substring(0, 60), jurisdiction);
    }

    // Check for active inquiry session
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

    // ========== ADVICE FLOW WITH 9 FOLLOW-UP QUESTIONS ==========
    if (intent === "advice_needed" && convId) {
      // Create session on first advice query
      if (!activeSession && chatUserId && chatUserId !== "authenticated_user") {
        activeSession = await createInquirySession(chatUserId, convId, fullUserText);
      }

      const questionsAsked = activeSession?.questions_asked || 0;
      const factsGathered = activeSession?.facts_gathered || [];

      // Record user's latest answer as a fact
      if (questionsAsked > 0 && activeSession) {
        factsGathered.push({
          question_number: questionsAsked,
          user_response: fullUserText,
          timestamp: new Date().toISOString(),
        });
      }

      const nextQuestionNumber = questionsAsked + 1;

      // Check if we've completed all 9 questions -> deliver final analysis
      if (questionsAsked >= MAX_FOLLOWUP_QUESTIONS) {
        shouldDeliverFinal = true;

        const factsSummary = [
          `Original Issue: ${activeSession?.original_question || fullUserText}`,
          ...factsGathered.map((f: any, i: number) =>
            `Fact ${i + 1}: ${f.user_response}`
          ),
          `Latest User Input: ${fullUserText}`,
        ].join("\n\n");

        // Deliver tiered response based on subscription
        if (userStatus.isSubscribed) {
          systemPrompt = buildFinalSubscribedPrompt(jurisdiction, factsSummary);
        } else {
          systemPrompt = buildFinalFreeTierPrompt(jurisdiction, factsSummary);
        }

        userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nFACTS GATHERED FROM USER:\n${factsSummary}\n\nUSER'S FINAL INPUT:\n${fullUserText}`;

        answer = await generateAnswer(systemPrompt, userContentForLLM, history);

        // Mark session as delivered
        if (activeSession) {
          await updateInquirySession(activeSession.id, questionsAsked, factsGathered, true);
        }
      } else {
        // Ask the next follow-up question
        systemPrompt = buildFollowUpSystemPrompt(
          jurisdiction, 
          nextQuestionNumber, 
          activeSession?.original_question || fullUserText
        );

        userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nFACTS GATHERED SO FAR:\n${JSON.stringify(factsGathered, null, 2)}\n\nUSER'S LATEST MESSAGE:\n${fullUserText}`;

        answer = await generateAnswer(systemPrompt, userContentForLLM, history);

        // Update session with new question count
        if (activeSession) {
          await updateInquirySession(activeSession.id, nextQuestionNumber, factsGathered, false);
        }
      }
    }
    // ========== STATUTORY LOOKUP OR SKIP MODE ==========
    else {
      systemPrompt = buildStatutorySystemPrompt(jurisdiction);
      userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nUSER MESSAGE:\n${fullUserText}`;
      answer = await generateAnswer(systemPrompt, userContentForLLM, history);
    }

    // Save messages
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
