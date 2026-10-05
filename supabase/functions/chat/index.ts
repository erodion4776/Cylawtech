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

    // 1. List conversations
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

    // 4. Process Chat Message
    const body = await req.json();
    const {
      message,
      messages = [],
      conversation_id,
      jurisdiction = "Nigerian Law",
      user_id = "public_user",
      attachment,
    } = body;

    const activeUserId = user_id || headerUserId || "public_user";

    if ((!message || message.trim() === "") && !attachment) {
      return new Response(JSON.stringify({ error: "Please provide a legal inquiry." }), {
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

    // Web browsing helper
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
      const displayMsg = attachment 
        ? `${message}\n\n📎 *Attached file: ${attachment.name}*`
        : message;
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

    // Check if this is the start of a chat or a follow-up turn
    const isFollowUpTurn = Array.isArray(messages) && messages.length >= 2;

    // SYSTEM PROMPT: SINGLE-INTAKE PROTOCOL (NO ENDLESS LOOPS)
    const systemPrompt = `You are Lex AI, a senior legal counsel and legal assistant specializing in ${jurisdiction}.

OPERATIONAL RULES:

1. DRAFTING & DIRECT QUESTIONS:
If the user asks to draft a contract, review an attachment/text, or asks an informational question (e.g., "Draft an NDA", "Explain tenancy notice", "What is Section 305 CAMA?"), answer and draft IMMEDIATELY without asking unnecessary questions.

2. NEW COMPLEX LEGAL DISPUTES (FIRST MESSAGE ONLY):
If the user describes a fresh legal problem or dispute that requires specific facts:
- Acknowledge their situation with professional empathy.
- Give a brief 2-sentence initial legal overview.
- List ALL the questions you need in ONE single clear, numbered list (maximum 3-4 questions: parties involved, timeline/dates, written documents/evidence, and desired outcome).
- Inform the user: "Once you share these details, I will provide your complete legal analysis and action plan."
- NEVER ask questions more than once!

3. SECOND TURN / AFTER USER REPLIES (PROCEED IMMEDIATELY):
${isFollowUpTurn ? "CRITICAL: The user is now providing details. YOU MUST PROCEED IMMEDIATELY TO THE COMPLETE LEGAL ANALYSIS. DO NOT ASK ANY MORE QUESTIONS. Work with the facts provided and state any necessary assumptions." : "Once the user provides details on the next turn, proceed directly to the full analysis without asking another round of questions."}

STRUCTURE OF FULL LEGAL ANALYSIS (When delivering final analysis):
### 1. LEGAL ISSUES IDENTIFIED
[Concise breakdown of the core legal issues]

### 2. APPLICABLE LAWS & STATUTES (WITH CITATIONS)
[Cite exact sections from relevant Acts, e.g., CAMA 2020 Sec. 305, 1999 Constitution, or relevant case precedents under ${jurisdiction}]

### 3. LEGAL ANALYSIS
[Step-by-step application of the legal rules to the user's specific facts]

### 4. STRATEGIC OPTIONS & RECOMMENDED NEXT STEPS
[Practical, actionable steps: demand letter, mediation, regulatory report, court filing, etc.]

### 5. SOURCES CITED
- [List exact Acts, Sections, Case Law, and documents consulted]

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer before taking formal action.*

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
