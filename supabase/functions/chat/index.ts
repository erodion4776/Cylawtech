import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Groq from "https://esm.sh/groq-sdk@0.5.0";

const DAILY_LIMIT = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

// Web Browsing Helper
async function browseWebpage(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return `[Web browsing failed: HTTP status ${res.status}]`;

    const html = await res.text();
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleanText.substring(0, 4000);
  } catch (err: any) {
    console.warn("Web browsing error:", err.message);
    return "";
  }
}

// Voice Note Transcriber via Groq Whisper (< 300ms)
async function transcribeAudio(base64Data: string, mimeType: string, fileName: string, groqApiKey: string): Promise<string> {
  try {
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const audioBlob = new Blob([bytes], { type: mimeType || 'audio/webm' });
    const formData = new FormData();
    formData.append('file', audioBlob, fileName || 'voicenote.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq Whisper error:", errText);
      return "[Voice transcription unavailable]";
    }

    const data = await res.json();
    return data.text || "";
  } catch (err: any) {
    console.error("Audio transcription error:", err.message);
    return "[Voice transcription error]";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return new Response(
        JSON.stringify({ error: "Configuration Error: GROQ_API_KEY is missing." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const groq = new Groq({ apiKey: groqKey });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "send";
    const headerUserId = req.headers.get("x-user-id");

    // 1. List
    if (action === "list") {
      const targetUser = url.searchParams.get("user_id") || headerUserId || "public_user";
      const { data } = await supabase
        .from("conversations")
        .select("id, title, jurisdiction, mode, updated_at")
        .eq("user_id", targetUser)
        .order("updated_at", { ascending: false })
        .limit(50);

      const today = new Date().toISOString().split("T")[0];
      const { data: usageData } = await supabase
        .from("user_daily_usage")
        .select("count")
        .eq("user_id", targetUser)
        .eq("usage_date", today)
        .maybeSingle();

      const currentCount = usageData?.count || 0;

      return new Response(
        JSON.stringify({ 
          conversations: data || [],
          usage: { count: currentCount, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - currentCount) }
        }), 
        { headers: corsHeaders }
      );
    }

    // 2. History
    if (action === "history") {
      const { conversation_id } = await req.json();
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      return new Response(JSON.stringify({ messages: data || [] }), { headers: corsHeaders });
    }

    // 3. Delete
    if (action === "delete") {
      const { conversation_id } = await req.json();
      await supabase.from("conversations").delete().eq("id", conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 4. Send Message (Multimodal + Audio Transcription)
    const body = await req.json();
    let {
      message = "",
      messages = [],
      conversation_id,
      jurisdiction = "Nigerian Law",
      user_id = "public_user",
      attachment,
    } = body;

    const activeUserId = user_id || headerUserId || "public_user";

    // Transcribe audio / voice note if attached
    let audioTranscript = "";
    if (attachment && attachment.type === "audio" && attachment.base64) {
      audioTranscript = await transcribeAudio(attachment.base64, attachment.mimeType, attachment.name, groqKey);
      if (audioTranscript && audioTranscript.trim().length > 0) {
        message = message ? `${message}\n\n[Spoken Voice Note]: "${audioTranscript}"` : audioTranscript;
      }
    }

    if ((!message || message.trim() === "") && !attachment) {
      return new Response(JSON.stringify({ error: "Please provide a legal inquiry, upload a document, or record a voice note." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Rate Limit Check
    const today = new Date().toISOString().split("T")[0];
    const { data: currentUsage } = await supabase
      .from("user_daily_usage")
      .select("count")
      .eq("user_id", activeUserId)
      .eq("usage_date", today)
      .maybeSingle();

    const usedSoFar = currentUsage?.count || 0;

    if (usedSoFar >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ 
          error: "Daily Inquiry Limit Reached. Please upgrade or try again tomorrow.",
          paywall: true,
          usage: { count: usedSoFar, limit: DAILY_LIMIT, remaining: 0 }
        }),
        { status: 429, headers: corsHeaders }
      );
    }

    // Increment Usage
    await supabase.from("user_daily_usage").upsert({
      user_id: activeUserId,
      usage_date: today,
      count: usedSoFar + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, usage_date" });

    // Web browsing extraction
    let webContext = "";
    const urlMatches = message.match(/https?:\/\/[^\s]+/g);
    if (urlMatches && urlMatches.length > 0) {
      const targetUrl = urlMatches[0];
      const pageText = await browseWebpage(targetUrl);
      if (pageText) {
        webContext = `\n\n[LIVE BROWSED CONTENT FROM ${targetUrl}]:\n${pageText}\n`;
      }
    }

    // Conversation management
    let convId = conversation_id;
    const initialText = message || `Review attached ${attachment?.name || "document"}`;
    if (!convId) {
      const title = initialText.length > 35 ? initialText.substring(0, 35) + "..." : initialText;
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ title, jurisdiction, user_id: activeUserId })
        .select()
        .single();
      if (newConv) convId = newConv.id;
    } else {
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString(), jurisdiction })
        .eq("id", convId);
    }

    // Save user message in DB
    if (convId) {
      let displayMsg = message;
      if (attachment && attachment.type === 'audio') {
        displayMsg = `🎙️ *Voice Note:* "${audioTranscript || 'Audio attachment'}"${message && message !== audioTranscript ? `\n\n${message}` : ''}`;
      } else if (attachment) {
        displayMsg = `${message}\n\n📎 *Attached: ${attachment.name}*`;
      }

      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "user",
        content: displayMsg,
      });
    }

    // Search knowledge library (RAG)
    let legalContext = "";
    try {
      const { data: matches } = await supabase.rpc("search_statutory_library", {
        query_text: message || attachment?.name || "contract review",
        p_jurisdiction: jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "us",
        match_limit: 3,
      });
      if (matches && matches.length > 0) {
        legalContext = matches.map((m: any) => `[DOCUMENT SOURCE: ${m.document_title}]\n${m.content}`).join("\n\n---\n\n");
      }
    } catch { /* silent */ }

    const isFollowUpTurn = Array.isArray(messages) && messages.length >= 2;

    // SYSTEM PROMPT
    const systemPrompt = `You are Lex AI, a senior legal counsel and multimodal legal intelligence assistant specializing in ${jurisdiction}.

CAPABILITIES:
1. VOICE NOTE INTERPRETATION: You can listen to and process transcribed user voice recordings. Treat them with the same legal rigor as written questions.
2. DOCUMENT & PDF AUDITING: Review uploaded contracts, identifying loopholes, liabilities, and statutory compliance.
3. VISUAL INSPECTION: Inspect images of signed documents, receipts, or property evidence.
4. WEB RESEARCH: Analyze live browsed webpage contents.

OPERATIONAL RULES:
1. DRAFTING & DIRECT QUESTIONS:
If the user asks to draft a contract, review an attachment, or asks an informational question, answer or draft IMMEDIATELY without asking unnecessary questions.

2. NEW COMPLEX LEGAL DISPUTES (FIRST TURN ONLY):
If the user describes a fresh legal problem that requires specific facts:
- Acknowledge their situation with professional empathy.
- Give a brief 2-sentence initial legal overview.
- List ALL the questions you need in ONE single clear, numbered list (maximum 3-4 questions).
- Inform the user: "Once you share these details, I will provide your complete legal analysis and action plan."
- NEVER ask questions in a loop!

3. SECOND TURN / AFTER USER REPLIES (PROCEED IMMEDIATELY):
${isFollowUpTurn ? "CRITICAL: The user is now providing details. PROCEED IMMEDIATELY TO THE COMPLETE LEGAL ANALYSIS. DO NOT ASK ANY MORE QUESTIONS." : "Once the user provides details on the next turn, proceed directly to the full analysis without asking another round of questions."}

STRUCTURE OF FULL LEGAL ANALYSIS:
### 1. LEGAL ISSUES IDENTIFIED
### 2. APPLICABLE LAWS & STATUTES (WITH CITATIONS)
### 3. LEGAL ANALYSIS
### 4. STRATEGIC OPTIONS & RECOMMENDED NEXT STEPS
### 5. SOURCES CITED
- [List exact Acts, Sections, Case Law, and documents consulted]

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer.*

${webContext}
${attachment?.extractedText ? `\n\n[ATTACHED DOCUMENT CONTENT (${attachment.name})]:\n${attachment.extractedText}\n` : ""}
${legalContext ? `\nRELEVANT STATUTORY REFERENCES:\n${legalContext}` : ""}`;

    const chatMessages: any[] = [{ role: "system", content: systemPrompt }];

    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((m: any) => {
        if (m.content) {
          chatMessages.push({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          });
        }
      });
    } else {
      chatMessages.push({ role: "user", content: message });
    }

    const isImage = attachment && attachment.type === "image" && attachment.base64;
    let selectedModel = isImage ? "llama-3.2-11b-vision-preview" : "llama-3.1-8b-instant";

    if (isImage) {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: message || "Please review and analyze this attached legal document / image." },
          {
            type: "image_url",
            image_url: {
              url: `data:${attachment.mimeType || "image/jpeg"};base64,${attachment.base64}`,
            },
          },
        ],
      });
    }

    const candidateModels = isImage 
      ? ["llama-3.2-11b-vision-preview", "llama-3.1-8b-instant"]
      : ["llama-3.1-8b-instant", "openai/gpt-oss-20b"];

    let reply = "";
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: chatMessages,
          temperature: 0.2,
          max_tokens: 2200,
        });

        reply = completion.choices[0]?.message?.content || "";
        if (reply) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed. Trying fallback...`);
      }
    }

    if (!reply) {
      throw lastError || new Error("All AI inference models failed.");
    }

    // Save assistant reply in DB
    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: reply,
      });
    }

    return new Response(
      JSON.stringify({
        response: reply,
        conversation_id: convId,
        transcription: audioTranscript || undefined,
        usage: {
          count: usedSoFar + 1,
          limit: DAILY_LIMIT,
          remaining: Math.max(0, DAILY_LIMIT - (usedSoFar + 1)),
        }
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Chat Error:", error);
    return new Response(
      JSON.stringify({ error: `AI Assistant Error: ${error.message || "Failed to process request"}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
