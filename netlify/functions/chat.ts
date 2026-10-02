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

    // 1. Action: Get Conversations List
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

    // 2. Action: Get Conversation History
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

    // 3. Action: Delete Conversation
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

    // Manage conversation session safely
    let convId = conversation_id;
    try {
      if (!convId) {
        const title = message.length > 35 ? message.substring(0, 35) + "..." : message;
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ title, jurisdiction, mode })
          .select()
          .single();
        if (newConv) convId = newConv.id;
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

    // Search Knowledge Library using Postgres Full-Text Search
    let contextDocuments = "";
    try {
      const siteFilter = jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "us";
      const { data: matches } = await supabase.rpc("search_legal_documents", {
        query_text: message,
        p_site: siteFilter,
        p_context: "general",
        match_limit: 4,
      });

      if (matches && matches.length > 0) {
        contextDocuments = matches
          .map((m: any) => `[STATUTE/CASE: ${m.title}]\n${m.content}`)
          .join("\n\n---\n\n");
      }
    } catch (searchErr) {
      console.warn("Knowledge search fallback:", searchErr);
    }

    // Mode-specific legal directives
    let stageDirective = "Focus on structured IRAC legal analysis (Issue, Rule, Application, Conclusion).";
    if (mode === "training") {
      stageDirective = "Act as senior legal mentor. Critique reasoning and provide statutory recommendations.";
    } else if (mode === "practice") {
      stageDirective = "Draft precise legal clauses, contracts, or statutory advice.";
    }

    const systemPrompt = `You are LexAI, a high-level legal intelligence counsel.

JURISDICTION: ${jurisdiction}

PRIMARY OBJECTIVE:
${stageDirective}

KNOWLEDGE BASE & STATUTORY CONTEXT:
${contextDocuments || "Use your knowledge of standard statutory frameworks and legal principles for this jurisdiction."}

GUIDELINES:
- Provide structured, formal, and authoritative legal analysis.
- Use numbered points and bold headings.
- Reference relevant statutory provisions, principles, and case law where applicable.
- Answer clearly, directly, and concisely.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const reply = completion.choices[0]?.message?.content || "Unable to generate legal analysis at this time.";

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
