import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Groq from "https://esm.sh/groq-sdk@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
        JSON.stringify({ error: "Configuration Error: GROQ_API_KEY secret is not set in Supabase." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const groq = new Groq({ apiKey: groqKey });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "send";

    // 1. Action: Get conversations list
    if (action === "list") {
      try {
        const { data } = await supabase
          .from("conversations")
          .select("id, title, jurisdiction, mode, updated_at")
          .order("updated_at", { ascending: false })
          .limit(50);
        return new Response(JSON.stringify({ conversations: data || [] }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ conversations: [] }), { headers: corsHeaders });
      }
    }

    // 2. Action: Get conversation history
    if (action === "history") {
      try {
        const { conversation_id } = await req.json();
        const { data } = await supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: true });
        return new Response(JSON.stringify({ messages: data || [] }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ messages: [] }), { headers: corsHeaders });
      }
    }

    // 3. Action: Delete conversation
    if (action === "delete") {
      try {
        const { conversation_id } = await req.json();
        await supabase.from("conversations").delete().eq("id", conversation_id);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
      }
    }

    // 4. Process Chat Message
    const body = await req.json();
    const {
      message,
      messages = [], // Full chat history from frontend
      conversation_id,
      jurisdiction = "Nigerian Law",
    } = body;

    if (!message || message.trim() === "") {
      return new Response(JSON.stringify({ error: "Please enter a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Manage conversation in database
    let convId = conversation_id;
    try {
      if (!convId) {
        const title = message.length > 35 ? message.substring(0, 35) + "..." : message;
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ title, jurisdiction })
          .select()
          .single();
        if (newConv) convId = newConv.id;
      }
    } catch (e) {
      console.warn("DB conversation creation skipped:", e);
    }

    // Save user message to database
    try {
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "user",
          content: message,
        });
      }
    } catch (e) {
      console.warn("User message log skipped:", e);
    }

    // Search knowledge library (RAG)
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

    // STRICT MULTI-STAGE LEGAL INTAKE SYSTEM PROMPT
    const systemPrompt = `You are Lex AI, a seasoned Nigerian legal practitioner acting as an interactive client-consultant.

JURISDICTION: ${jurisdiction}

YOUR ABSOLUTE MANDATE:
You are conducting a strict, sequential client intake interview. You are FORBIDDEN from giving a final legal opinion, structured analysis, or IRAC block in your early responses. You must ALWAYS guide the client by asking targeted follow-up questions first.

THE INTAKE RULES (MANDATORY):
1. ALWAYS ASK FOLLOW-UP QUESTIONS: Every single response you make MUST contain 1 to 2 targeted follow-up questions to gather necessary context.
2. DO NOT ANSWER YET: Even if you think you have enough facts to solve the problem, do not provide a final legal conclusion or full structured analysis. Instead, explain what legal issue you are investigating and ask a clarifying question about it.
3. CONVERSATIONAL PACE: Ask only 1 or 2 questions at a time. Never overwhelm the user with a list of questions.
4. GATHER THE FOLLOWING CONTEXT (One by one over multiple turns):
   - What exact corporate or legal structure is involved (e.g., limited liability company under CAMA, registered business name, unregistered partnership, or private individuals)?
   - When did the events occur (specific timeline, dates, or frequency)?
   - Are there written contracts, deeds, receipts, emails, or WhatsApp communications that prove the dispute?
   - What specific outcome, remedy, or protection is the user trying to achieve?

EXCEPTIONS (WHEN YOU ARE ALLOWED TO GIVE A FULL ANALYSIS):
Only provide your final structured analysis (with Issues, Applicable Laws, Analysis, and Next Steps) if:
- The user explicitly requests: "Give me the final analysis" OR "Provide your final opinion now."
- OR you have successfully conducted a thorough back-and-forth interview of at least 3 to 4 turns and have collected all necessary facts.

Otherwise, your ONLY job is to acknowledge what they said, explain why more context is needed under ${jurisdiction}, and ask your follow-up questions.

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer before taking formal action.*

${legalContext ? `\nRELEVANT STATUTORY REFERENCES:\n${legalContext}` : ""}`;

    // Construct full conversation history
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

    // ONLY active, verified production models on Groq
    const activeModels = [
      "llama-3.1-8b-instant",  // Active Production (560 t/sec) - Primary
      "openai/gpt-oss-20b",     // Active Production (1000 t/sec) - Fallback 1
      "openai/gpt-oss-120b"     // Active Production (500 t/sec) - Fallback 2
    ];

    let reply = "";
    let lastError: any = null;

    for (const modelName of activeModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: chatMessages,
          temperature: 0.1, // Low temperature forces strict intake protocol
          max_tokens: 1500,
        });

        reply = completion.choices[0]?.message?.content || "";
        if (reply) {
          console.log(`[Lex AI SUCCESS] Generated response with: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Lex AI WARN] Model ${modelName} failed (${err.message}). Trying fallback...`);
      }
    }

    if (!reply) {
      throw lastError || new Error("All active Groq models failed.");
    }

    // Save assistant reply to DB
    try {
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: reply,
        });
      }
    } catch (e) {
      console.warn("Assistant DB insert skipped:", e);
    }

    return new Response(
      JSON.stringify({
        response: reply,
        conversation_id: convId,
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
