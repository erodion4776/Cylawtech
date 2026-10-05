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

    // Action: List
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

    // Action: History
    if (action === "history") {
      const { conversation_id } = await req.json();
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      return new Response(JSON.stringify({ messages: data || [] }), { headers: corsHeaders });
    }

    // Action: Delete
    if (action === "delete") {
      const { conversation_id } = await req.json();
      await supabase.from("conversations").delete().eq("id", conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // Action: Send Message
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

    // Increment Daily Usage
    await supabase.from("user_daily_usage").upsert({
      user_id: activeUserId,
      usage_date: today,
      count: usedSoFar + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, usage_date" });

    // Web Browsing Extraction
    let webContext = "";
    const urlMatches = message.match(/https?:\/\/[^\s]+/g);
    if (urlMatches && urlMatches.length > 0) {
      const targetUrl = urlMatches[0];
      const pageText = await browseWebpage(targetUrl);
      if (pageText) {
        webContext = `\n\n[LIVE BROWSED CONTENT FROM ${targetUrl}]:\n${pageText}\n`;
      }
    }

    // Manage Conversation ID
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

    // Search Knowledge Library (RAG)
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

    // STRICT SYSTEM PROMPT: Dynamic Intake with Citations & Sources Enforced
    const systemPrompt = `You are Lex AI, a senior legal practitioner and multijurisdictional legal intelligence assistant.

JURISDICTION: ${jurisdiction}

YOUR INTENSITY RULES:
You conduct structured legal intakes. Never provide a final legal conclusion or structured analysis in your first turn if key factual details are missing. Always guide the client by asking 1-2 focused follow-up questions first.

THE INTAKE PROTOCOL:
- If critical details (CAMA corporate structure, exact dates, monetary values, written agreements) are unknown, politely explain why they matter and ask your clarifying questions.
- Once all facts are gathered, transition into a complete, formal legal analysis.

STRICT CITATION DIRECTIVE (For Final Analysis):
When delivering a full legal analysis, you MUST provide explicit citations:
1. INLINE CITATIONS: For every statutory rule or precedent you mention, cite the exact act and section directly within the sentence (e.g., "...under Section 305 of the Companies and Allied Matters Act (CAMA) 2020..." or "...as established in the US Uniform Commercial Code, Article 2-201...").
2. SOURCES CITED SECTION: At the very bottom of your final analysis, list a structured directory of all sources consulted. This must include:
   - Specific Acts or Constitutions (e.g. 1999 Constitution of Nigeria, Section 36)
   - Judicial precedents/Case Law citations
   - Uploaded PDF/Image document names (if provided)
   - Live web links analyzed (if provided)

STRUCTURE FOR FINAL LEGAL ANALYSIS:
### 1. LEGAL ISSUES IDENTIFIED
### 2. APPLICABLE LAWS & STATUTORY RULES (WITH CITATIONS)
### 3. LEGAL ANALYSIS & DOCUMENT AUDIT
### 4. STRATEGIC OPTIONS & RECOMMENDED NEXT STEPS
### 5. SOURCES CITED
- [List exact acts, sections, judgments, and provided references here]

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer.*

${webContext}
${attachment?.extractedText ? `\n\n[EXTRACTED ATTACHMENT TEXT (${attachment.name})]:\n${attachment.extractedText}\n` : ""}
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
    } else {
      chatMessages.push({
        role: "user",
        content: message || `Please review the attached document: ${attachment?.name || ""}`,
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
          temperature: 0.2, // Low temperature enforces strict citation guidelines
          max_tokens: 2000,
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

    // Save assistant reply to DB
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
