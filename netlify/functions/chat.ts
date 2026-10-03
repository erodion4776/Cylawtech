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

    // Action: Get list
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

    // Action: Get history
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

    // Action: Delete conversation
    if (action === "delete") {
      try {
        const { conversation_id } = await req.json();
        await supabase.from("conversations").delete().eq("id", conversation_id);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
      }
    }

    // Process Chat Request
    const body = await req.json();
    const {
      message,
      messages = [], // Full conversation thread from frontend
      conversation_id,
      jurisdiction = "Nigerian Law",
    } = body;

    if (!message || message.trim() === "") {
      return new Response(JSON.stringify({ error: "Please enter a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Manage DB conversation record
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
      console.warn("DB conversation skipped:", e);
    }

    // Save user message to DB
    try {
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "user",
          content: message,
        });
      }
    } catch (e) {
      console.warn("Message log skipped:", e);
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
    const systemPrompt = `You are Lex AI, a senior legal practitioner and interactive legal assistant specializing in ${jurisdiction}.

PRIMARY BEHAVIOR RULES (MANDATORY):
You behave like a lawyer conducting an in-person client consultation. A lawyer NEVER delivers a final legal opinion or full analysis immediately upon hearing a brief statement. You MUST first gather the necessary facts.

STAGE 1 — FACT GATHERING & CLARIFYING QUESTIONS (DEFAULT):
When the user shares a problem, dispute, or question, check if you have all critical facts:
1. What exact event or dispute occurred?
2. Who are the parties (individuals, registered company under CAMA, government, landlord/tenant)?
3. What is the timeline or relevant dates?
4. Are there written documents (agreements, receipts, emails, chats, titles)?
5. What specific outcome or remedy does the client want (money back, termination, compensation, defense)?

IF CRITICAL FACTS ARE MISSING:
- Empathize briefly and acknowledge their situation.
- Ask 1 to 3 targeted, clear follow-up questions to understand the situation.
- Explain briefly why those details matter under the law.
- DO NOT provide a final conclusion or full legal breakdown yet. Keep responses under 5 sentences.

STAGE 2 — FULL LEGAL ANALYSIS (ONLY WHEN FACTS ARE COMPLETE):
Only when the user has answered your follow-up questions and you have sufficient facts, provide your comprehensive legal opinion structured as follows:

### 1. LEGAL ISSUES IDENTIFIED
[State the exact legal question and dispute]

### 2. APPLICABLE LAWS & STATUTORY RULES
[Cite specific sections from Nigerian Acts, CAMA 2020, Constitution, or relevant case law]

### 3. LEGAL ANALYSIS & APPLICATION
[Apply the statutory rules directly to the client's concrete facts]

### 4. STRATEGIC OPTIONS & RECOMMENDED NEXT STEPS
[Clear, practical action items: demand letter, police report, mediation, litigation, etc.]

***
⚖️ *Lex AI provides legal information, not legal representation. Please consult a licensed Nigerian lawyer before taking formal legal action.*

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

    // Active Groq models
    const activeModels = [
      "llama-3.1-8b-instant",
      "gemma2-9b-it",
      "llama-3.2-3b-preview"
    ];

    let reply = "";
    let lastError: any = null;

    for (const modelName of activeModels) {
      try {
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: chatMessages,
          temperature: 0.2, // Low temperature forces strict compliance
          max_tokens: 1800,
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
