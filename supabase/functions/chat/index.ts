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
// USAGE TRACKING (10 Free Trial Messages Per User)
// ============================================================

async function getUserUsage(userId: string): Promise<{ used: number; limit: number }> {
  const { data } = await supabase
    .from("user_usage")
    .select("trial_messages_used, trial_limit")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabase.from("user_usage").insert({
      user_id: userId,
      trial_messages_used: 0,
      trial_limit: TRIAL_LIMIT,
    });
    return { used: 0, limit: TRIAL_LIMIT };
  }

  return { used: data.trial_messages_used || 0, limit: data.trial_limit || TRIAL_LIMIT };
}

async function incrementUsage(userId: string): Promise<{ used: number; limit: number }> {
  const current = await getUserUsage(userId);

  if (current.used >= current.limit) {
    return current;
  }

  const newCount = current.used + 1;
  await supabase
    .from("user_usage")
    .update({ trial_messages_used: newCount, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { used: newCount, limit: current.limit };
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
    conversation_id: conversationId,
    role,
    content,
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
// LLM GENERATION (Text + Vision)
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
    .slice(-4)
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
          body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 2500 }),
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
        body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.1, max_tokens: 2500 }),
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
// MAIN DISPATCHER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("user_id") || "";

    // ---- LIST CONVERSATIONS ----
    if (action === "list" && userId) {
      const conversations = await listConversations(userId);
      const usage = await getUserUsage(userId);
      return json({ conversations, usage });
    }

    // ---- LOAD HISTORY ----
    if (action === "history" && req.method === "POST") {
      const body = await req.json();
      const messages = await loadConversationHistory(body.conversation_id);
      return json({ messages });
    }

    // ---- DELETE CONVERSATION ----
    if (action === "delete" && req.method === "POST") {
      const body = await req.json();
      await deleteConversation(body.conversation_id);
      return json({ success: true });
    }

    // ---- MAIN CHAT ----
    const body = await req.json().catch(() => null);
    if (!body) return errorResponse("Invalid request.", 400);

    const userMessage = cleanString(body.message);
    const attachment = body.attachment || null;
    const chatUserId = body.user_id || userId;
    const jurisdiction = normalizeJurisdiction(body.jurisdiction);

    // Check trial limit
    if (chatUserId && chatUserId !== "authenticated_user") {
      const usage = await getUserUsage(chatUserId);
      if (usage.used >= usage.limit) {
        return json({
          paywall: true,
          error: `You have used all ${TRIAL_LIMIT} free trial messages. Upgrade for unlimited access.`,
          usage,
        });
      }
    }

    let fullUserText = userMessage;
    let transcription = "";
    let userContentForLLM: string | Array<any> = "";

    // Process attachments
    if (attachment) {
      if (attachment.type === "audio" && attachment.base64) {
        transcription = await transcribeAudio(attachment.base64, attachment.mimeType);
        fullUserText = transcription + (userMessage ? `\n\n${userMessage}` : "");
      } else if (attachment.type === "pdf" && attachment.extractedText) {
        fullUserText = userMessage + `\n\n--- EXTRACTED PDF CONTENT ---\n${attachment.extractedText.substring(0, 8000)}`;
      } else if (attachment.type === "text" && attachment.extractedText) {
        fullUserText = userMessage + `\n\n--- EXTRACTED DOCUMENT ---\n${attachment.extractedText.substring(0, 8000)}`;
      } else if (attachment.type === "image" && attachment.base64) {
        // Vision: send image + text to vision model
        userContentForLLM = [
          { type: "text", text: fullUserText || "Analyze this image and describe any legal documents, contracts, or text visible." },
          { type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64}` } },
        ];
      }
    }

    if (!userContentForLLM) {
      // Text-only query: add statutory context
      const chunks = await retrieveStatutoryContext(fullUserText, jurisdiction);
      const contextPayload = chunks.length > 0
        ? chunks.map((c, i) => `--- AUTHORITY [${i + 1}] ---\nDOCUMENT: ${c.document_title}\nSECTION: ${c.section_number || "General"}\nTEXT:\n${c.content.substring(0, 1000)}`).join("\n\n")
        : "No indexed statutory provisions found.";

      const systemPrompt = `You are LexAI, an authoritative statutory intelligence assistant for ${jurisdiction.toUpperCase()} law.
RULES:
1. STRICT GROUNDING: Base answers on the STATUTORY CONTEXT provided. Do not fabricate sections.
2. Use structured bullet points. Always conclude completely. Never end mid-sentence.`;

      userContentForLLM = `STATUTORY CONTEXT:\n${contextPayload}\n\nUSER QUESTION:\n${fullUserText}`;

      // Generate answer
      const answer = await generateAnswer(systemPrompt, userContentForLLM, body.history || []);

      // Save to history
      let convId = body.conversation_id;
      if (chatUserId && chatUserId !== "authenticated_user") {
        if (!convId) {
          convId = await createConversation(chatUserId, fullUserText.substring(0, 60), jurisdiction);
        }
        if (convId) {
          await saveMessage(convId, "user", fullUserText);
          await saveMessage(convId, "assistant", answer);
        }
        await incrementUsage(chatUserId);
      }

      const usage = chatUserId ? await getUserUsage(chatUserId) : { used: 0, limit: TRIAL_LIMIT };

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
        usage,
      });
    } else {
      // Vision query (image attached)
      const systemPrompt = `You are LexAI, a legal document analysis assistant. Analyze the attached image carefully. If it contains a legal document, contract, or statutory text, identify key clauses, parties, dates, obligations, and potential legal issues. Provide structured analysis.`;

      const answer = await generateAnswer(systemPrompt, userContentForLLM, body.history || []);

      let convId = body.conversation_id;
      if (chatUserId && chatUserId !== "authenticated_user") {
        if (!convId) convId = await createConversation(chatUserId, "Image Analysis", jurisdiction);
        if (convId) {
          await saveMessage(convId, "user", fullUserText || "[Image attached]");
          await saveMessage(convId, "assistant", answer);
        }
        await incrementUsage(chatUserId);
      }

      const usage = chatUserId ? await getUserUsage(chatUserId) : { used: 0, limit: TRIAL_LIMIT };

      return json({
        success: true,
        answer,
        conversation_id: convId,
        citations: [],
        transcription: transcription || undefined,
        usage,
      });
    }
  } catch (error: any) {
    console.error("Chat Error:", error);
    return errorResponse(error?.message || "Chat service error", 500);
  }
});
