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

    // ==========================================
    // ACTION: Get Conversations (Scoped to user_id)
    // ==========================================
    if (action === "list") {
      const targetUser = url.searchParams.get("user_id") || headerUserId || "public_user";
      const { data } = await supabase
        .from("conversations")
        .select("id, title, jurisdiction, mode, updated_at")
        .eq("user_id", targetUser)
        .order("updated_at", { ascending: false })
        .limit(50);

      // Also fetch today's database usage count
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
          usage: {
            count: currentCount,
            limit: DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - currentCount)
          }
        }), 
        { headers: corsHeaders }
      );
    }

    // ==========================================
    // ACTION: Get Conversation History
    // ==========================================
    if (action === "history") {
      const { conversation_id } = await req.json();
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      return new Response(JSON.stringify({ messages: data || [] }), { headers: corsHeaders });
    }

    // ==========================================
    // ACTION: Delete Conversation
    // ==========================================
    if (action === "delete") {
      const { conversation_id } = await req.json();
      await supabase.from("conversations").delete().eq("id", conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ==========================================
    // ACTION: Send Message & Record In Database
    // ==========================================
    const body = await req.json();
    const {
      message,
      messages = [],
      conversation_id,
      jurisdiction = "Nigerian Law",
      user_id = "public_user",
    } = body;

    const activeUserId = user_id || headerUserId || "public_user";

    if (!message || message.trim() === "") {
      return new Response(JSON.stringify({ error: "Please enter a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1. Check & Enforce Database Daily Rate Limit
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

    // 2. Increment Usage Count in Database
    await supabase.from("user_daily_usage").upsert({
      user_id: activeUserId,
      usage_date: today,
      count: usedSoFar + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, usage_date" });

    // 3. Create or Update Conversation Session in Database
    let convId = conversation_id;
    if (!convId) {
      const title = message.length > 35 ? message.substring(0, 35) + "..." : message;
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

    // 4. Save User Message in Database
    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "user",
        content: message,
      });
    }

    // 5. Search Statutory Knowledge Base (RAG)
    let legalContext = "";
    try {
      const { data: matches } = await supabase.rpc("search_statutory_library", {
        query_text: message,
        p_jurisdiction: jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "us",
        match_limit: 3,
      });
      if (matches && matches.length > 0) {
        legalContext = matches.map((m: any) => `[${m.document_title}] ${m.content}`).join("\n\n---\n\n");
      }
    } catch { /* silent */ }

    // System Prompt for Interactive Intake
    const systemPrompt = `You are Lex AI, a seasoned Nigerian & US legal practitioner acting as an interactive client-consultant.

JURISDICTION: ${jurisdiction}

YOUR ABSOLUTE MANDATE:
You are conducting a strict, sequential client intake interview. You are FORBIDDEN from giving a final legal opinion, structured analysis, or IRAC block in your early responses. You must ALWAYS guide the client by asking targeted follow-up questions first.

THE INTAKE RULES (MANDATORY):
1. ALWAYS ASK FOLLOW-UP QUESTIONS: Every single response you make MUST contain 1 to 2 targeted follow-up questions to gather necessary context.
2. DO NOT ANSWER YET: Explain what legal issue you are investigating and ask a clarifying question about it.
3. CONVERSATIONAL PACE: Ask only 1 or 2 questions at a time.
4. GATHER THE FOLLOWING CONTEXT:
   - What exact corporate or legal structure is involved?
   - When did the events occur (dates/timeline)?
   - Are there written contracts, deeds, receipts, emails, or WhatsApp communications?
   - What specific outcome, remedy, or protection is the user trying to achieve?

EXCEPTIONS (FULL ANALYSIS):
Only provide your final structured analysis (with Issues, Applicable Laws, Analysis, and Next Steps) if:
- The user explicitly requests: "Give me the final analysis" OR "Provide your final opinion now."
- OR you have conducted at least 3 to 4 turns of follow-up questions and collected all necessary facts.

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer.*

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

    // Active Groq Production Models
    const activeModels = [
      "llama-3.1-8b-instant",
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b"
    ];

    let reply = "";
    let lastError: any = null;

    for (const modelName of activeModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: chatMessages,
          temperature: 0.1,
          max_tokens: 1500,
        });

        reply = completion.choices[0]?.message?.content || "";
        if (reply) break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!reply) {
      throw lastError || new Error("All AI inference models failed.");
    }

    // 6. Save Assistant Reply to Database
    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: reply,
      });
    }

    const updatedRemaining = Math.max(0, DAILY_LIMIT - (usedSoFar + 1));

    return new Response(
      JSON.stringify({
        response: reply,
        conversation_id: convId,
        usage: {
          count: usedSoFar + 1,
          limit: DAILY_LIMIT,
          remaining: updatedRemaining,
        }
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Chat Error:", error);
    return new Response(
      JSON.stringify({ error: `AI Assistant Error: ${error.message || "Failed to process inquiry"}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
