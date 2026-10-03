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

    // Manage conversation session and prior memory
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

    // STRICT SYSTEM PROMPT: Fact Gathering & Sequential Interviewing
    const systemPrompt = `You are Lex AI, a senior legal counsel and interactive legal intelligence assistant.

JURISDICTION: ${jurisdiction}

YOUR MANDATE:
You act like an experienced attorney conducting a structured client intake interview. You must NEVER provide a full legal analysis, IRAC block, or final conclusion in your first reply, or if key facts are missing. You must systematically gather information first.

THE INTAKE PROTOCOL (FOLLOW STRICTLY):

STEP 1: ASSESS FACTS IN THE CONVERSATION HISTORY
Review the entire message stream. Have you gathered clear, specific details regarding:
- The corporate/legal structure of any parties involved (e.g. registered LLC, partnership, individual)?
- The timeline (when did events happen)?
- Specific transaction or monetary values involved?
- The existence of written, signed agreements or communications?
- The specific outcome or remedy the client wants to achieve?

STEP 2: IF CRITICAL FACTS ARE MISSING (FACT-GATHERING PHASE)
- Do NOT provide a formal legal opinion, conclusion, or cite specific case outcomes yet.
- Compassionately acknowledge their statement.
- Ask exactly ONE or TWO clear, highly specific follow-up questions to fill in the blank.
- Explain briefly why those facts are necessary for the law.
- Keep your response brief, reassuring, and conversational (3-5 sentences max).

STEP 3: WHEN ALL FACTS ARE KNOWN (FULL ANALYSIS PHASE)
Only when you have sufficient details to draw a valid legal conclusion, deliver a structured analysis formatted EXACTLY as follows:

### LEGAL ISSUES IDENTIFIED
[Clear summary of the legal conflicts]

### APPLICABLE LAWS & PRECEDENTS
[Reference specific statutes, acts, or rules under ${jurisdiction}]

### LEGAL ANALYSIS
[Apply the rules step-by-step to the client's concrete facts]

### RECOMMENDED NEXT STEPS
[Actionable guidance and protective measures]

***
⚖️ *Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer before taking formal action.*

STYLE DIRECTIONS:
- Write like a trusted, professional attorney (warm, logical, precise).
- Address the client's specific facts directly—avoid generic essays.
- Never manufacture rules or statutory provisions.

${legalContext ? `\nRELEVANT LEGAL REFERENCE DOCUMENTS:\n${legalContext}` : ""}

Analyze the dialogue history and respond accordingly.`;

    const chatMessages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    // Build chat history context
    priorMessages.forEach((m) => {
      chatMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      });
    });

    // Add current user turn
    chatMessages.push({ role: "user", content: message });

    // Active production models on Groq
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
          temperature: 0.2, // Lower temperature enforces strict adherence to protocol
          max_tokens: 1500,
        });

        reply = completion.choices[0]?.message?.content || "";
        if (reply) {
          console.log(`[Lex AI SUCCESS] Response generated using: ${modelName}`);
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

    // Save assistant reply to database
    try {
      if (convId) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: reply,
        });
      }
    } catch (e) {
      console.warn("Assistant response log skipped:", e);
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
      JSON.stringify({ error: `AI Engine Error: ${error.message || "Failed to process inquiry"}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
