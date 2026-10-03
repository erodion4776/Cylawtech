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
        JSON.stringify({ error: "Configuration Error: GROQ_API_KEY not set in Supabase secrets." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const groq = new Groq({ apiKey: groqKey });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "send";

    // 1. Fetch Conversations List
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

    // 2. Fetch Conversation History
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

    // 3. Delete Conversation
    if (action === "delete") {
      try {
        const { conversation_id } = await req.json();
        await supabase.from("conversations").delete().eq("id", conversation_id);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
      }
    }

    // 4. Process User Legal Inquiry
    const body = await req.json();
    const {
      message,
      conversation_id,
      jurisdiction = "Nigerian Law",
      mode = "prep",
    } = body;

    if (!message || message.trim() === "") {
      return new Response(JSON.stringify({ error: "Please enter a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Manage conversation session
    let convId = conversation_id;
    let priorMessages: any[] = [];

    try {
      if (!convId) {
        const title = message.length > 35 ? message.substring(0, 35) + "..." : message;
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ title, jurisdiction, mode })
          .select()
          .single();
        if (newConv) convId = newConv.id;
      } else {
        // Load prior messages for conversation memory & follow-up intelligence
        const { data: prevMessages } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(20);
        priorMessages = prevMessages || [];
      }
    } catch (e) {
      console.warn("Conversation DB record skipped:", e);
    }

    // Save user message
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

    // Search Statutory Knowledge Base (optional, for RAG)
    let legalContext = "";
    try {
      const { data: matches } = await supabase.rpc("search_statutory_library", {
        query_text: message,
        p_jurisdiction: jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "us",
        match_limit: 3,
      });

      if (matches && matches.length > 0) {
        legalContext = matches
          .map((m: any) => `[${m.document_title}] ${m.content}`)
          .join("\n\n---\n\n");
      }
    } catch (searchErr) {
      console.warn("Knowledge library search skipped:", searchErr);
    }

    // CORE SYSTEM PROMPT: Interactive Legal Consultant Mode
    const systemPrompt = `You are Lex AI, a professional and empathetic Nigerian legal counsel acting as an interactive consultant.

JURISDICTION FOCUS: ${jurisdiction}

YOUR PRIMARY ROLE:
You behave like a senior lawyer during a client intake interview. Your goal is to understand the client's legal situation DEEPLY before providing any opinion.

INTERACTIVE CONSULTATION PROTOCOL:

STEP 1 — ASSESS WHAT YOU KNOW:
- Analyze the current conversation. Have you gathered enough facts to identify:
  (a) Who the parties involved are?
  (b) What exact event or dispute occurred?
  (c) The relevant dates and timeline?
  (d) Any documents, agreements, or communications involved?
  (e) The client's goal (seeking damages, enforcement, defense, prevention, etc.)?

STEP 2 — IF FACTS ARE INCOMPLETE (GATHER MORE INFORMATION):
- Ask ONE or TWO focused, friendly follow-up questions.
- Be conversational and warm, not interrogative.
- Explain briefly why the information is needed (e.g., "To determine if the contract is enforceable, I'll need to know…").
- Do NOT provide a formal legal opinion yet.
- Keep responses concise (3-5 sentences max during fact-gathering).

STEP 3 — WHEN YOU HAVE ENOUGH FACTS (DELIVER FULL ANALYSIS):
Transition into providing a complete legal analysis using the IRAC framework:

**ISSUE:** Clearly state the legal question(s) at hand.

**RULE:** Cite applicable statutes, case law, or legal principles (${jurisdiction}).

**ANALYSIS:** Apply the rule to the client's specific facts step by step.

**CONCLUSION:** Provide a clear professional opinion and recommended next steps.

STEP 4 — ALWAYS RECOMMEND PROFESSIONAL REVIEW:
End every full analysis with:
"⚖️ This analysis is based on the facts you shared. For formal representation or filing in court, please consult a licensed Nigerian lawyer."

STYLE GUIDELINES:
- Warm, professional, and clear — like a trusted lawyer, not a textbook.
- Use markdown bold headings for structure.
- Never fabricate laws. If uncertain, say so transparently.
- Reference the client's own words throughout to show you understand.

${legalContext ? `\nRELEVANT LEGAL REFERENCE DOCUMENTS AVAILABLE:\n${legalContext}` : ""}

Begin the consultation now based on the conversation history.`;

    // Build message history (OpenAI chat format)
    const chatMessages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add prior conversation turns
    priorMessages.forEach((m) => {
      chatMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      });
    });

    // Add current user message
    chatMessages.push({ role: "user", content: message });

    // Only active, verified Groq production models
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
          temperature: 0.3,
          max_tokens: 2000,
        });

        reply = completion.choices[0]?.message?.content || "";
        if (reply) {
          console.log(`[Lex AI SUCCESS] Response via: ${modelName}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed (${err.message}). Trying next...`);
      }
    }

    if (!reply) {
      throw lastError || new Error("All active legal reasoning models failed.");
    }

    // Save Lex AI's reply
    try {
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: reply,
        });
      }
    } catch (e) {
      console.warn("Assistant reply log skipped:", e);
    }

    return new Response(
      JSON.stringify({
        response: reply,
        conversation_id: convId,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Lex AI Consultation Error:", error);
    return new Response(
      JSON.stringify({ error: `Legal Consultant Error: ${error.message || "Unable to continue consultation."}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
