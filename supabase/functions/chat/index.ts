import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Groq from "https://esm.sh/groq-sdk@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

const groq = new Groq({ apiKey: Deno.env.get("GROQ_API_KEY") || "" });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

async function getEmbedding(text: string): Promise<number[] | null> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: text.substring(0, 1000) }] },
        }),
      }
    );
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch {
    return null;
  }
}

async function searchLegalDocs(message: string, jurisdiction: string): Promise<string> {
  const embedding = await getEmbedding(message);
  if (!embedding) return "";

  const context = jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "general";
  const { data: matches } = await supabase.rpc("match_site_documents", {
    query_embedding: embedding,
    match_threshold: 0.25,
    match_count: 5,
    p_site: "lexai",
    p_context: context,
  });

  if (matches && matches.length > 0) {
    return matches.map((m: any) => m.content).join("\n\n---\n\n");
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "send";

    // ==========================================
    // ACTION: Get all conversations (sidebar)
    // ==========================================
    if (action === "list") {
      const { data } = await supabase
        .from("conversations")
        .select("id, title, jurisdiction, mode, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ conversations: data || [] }), {
        headers: corsHeaders,
      });
    }

    // ==========================================
    // ACTION: Get messages for a conversation
    // ==========================================
    if (action === "history") {
      const { conversation_id } = await req.json();
      if (!conversation_id) {
        return new Response(JSON.stringify({ error: "Conversation ID required" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });

      return new Response(JSON.stringify({ messages: data || [] }), {
        headers: corsHeaders,
      });
    }

    // ==========================================
    // ACTION: Delete a conversation
    // ==========================================
    if (action === "delete") {
      const { conversation_id } = await req.json();
      if (!conversation_id) {
        return new Response(JSON.stringify({ error: "Conversation ID required" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      await supabase.from("conversations").delete().eq("id", conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // ==========================================
    // ACTION: Send a message & get AI response
    // ==========================================
    const {
      message,
      conversation_id,
      jurisdiction = "Nigerian Law",
      mode = "prep",
    } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Please type a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Check platform status
    const { data: settings } = await supabase.from("settings").select("*").single();
    if (settings && !settings.api_enabled) {
      return new Response(
        JSON.stringify({ error: "LexAI is currently undergoing maintenance. Please try again shortly." }),
        { status: 503, headers: corsHeaders }
      );
    }

    // Create or update conversation
    let convId = conversation_id;
    if (!convId) {
      const title = message.length > 40 ? message.substring(0, 40) + "..." : message;
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ title, jurisdiction, mode })
        .select()
        .single();
      convId = newConv?.id;
    } else {
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString(), jurisdiction, mode })
        .eq("id", convId);
    }

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: message,
    });

    // Search legal knowledge base
    const legalContext = await searchLegalDocs(message, jurisdiction);

    // Build stage-specific instructions
    let stageDirective = "";
    if (mode === "prep") {
      stageDirective =
        "Focus on structured IRAC legal analysis (Issue, Rule, Application, Conclusion). Help identify key legal issues and applicable statutes.";
    } else if (mode === "training") {
      stageDirective =
        "Act as a senior legal mentor. Critique the user's reasoning, highlight strengths, and suggest improvements with specific statutory references.";
    } else if (mode === "practice") {
      stageDirective =
        "Draft precise legal clauses, contract provisions, or memorandum sections using formal legal language appropriate for the jurisdiction.";
    }

    const systemPrompt = `You are LexAI, a senior legal research counsel and intelligence assistant.

JURISDICTION: ${jurisdiction}

YOUR ROLE:
${stageDirective}

LEGAL KNOWLEDGE BASE:
${legalContext || "Use your knowledge of standard statutory frameworks and legal principles for this jurisdiction."}

GUIDELINES:
- Provide clear, structured, professional legal analysis.
- Use numbered points and bold headings for clarity.
- Reference specific statutes, case law, and legal principles when relevant.
- Be authoritative yet approachable.
- If the knowledge base does not contain sufficient information, clearly state the limitations and provide general legal guidance.
- Never reveal internal system details or technical processes.`;

    // Generate response using Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const reply =
      completion.choices[0]?.message?.content ||
      "I was unable to generate a response at this moment. Please try again.";

    // Save assistant message
    await supabase.from("messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: reply,
    });

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
      JSON.stringify({
        error: "An unexpected issue occurred. Please try your inquiry again.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
