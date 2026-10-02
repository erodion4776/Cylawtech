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

// Built-in Native Supabase Embedding Model (No external API key required)
// @ts-ignore
const model = new Supabase.ai.Session("gte-small");

async function getNativeEmbedding(text: string): Promise<number[] | null> {
  try {
    const embedding = await model.run(text.substring(0, 1000), {
      mean_pool: true,
      normalize: true,
    });
    return Array.from(embedding);
  } catch (err) {
    console.error("Native embedding error:", err);
    return null;
  }
}

async function searchLegalDocs(message: string, jurisdiction: string): Promise<string> {
  const embedding = await getNativeEmbedding(message);
  if (!embedding) return "";

  const context = jurisdiction.toLowerCase().includes("nigeria") ? "nigeria" : "general";
  const { data: matches } = await supabase.rpc("match_site_documents", {
    query_embedding: embedding,
    match_threshold: 0.20,
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

    // 1. Fetch Conversations List
    if (action === "list") {
      const { data } = await supabase
        .from("conversations")
        .select("id, title, jurisdiction, mode, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ conversations: data || [] }), { headers: corsHeaders });
    }

    // 2. Fetch Chat History
    if (action === "history") {
      const { conversation_id } = await req.json();
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });

      return new Response(JSON.stringify({ messages: data || [] }), { headers: corsHeaders });
    }

    // 3. Delete Conversation
    if (action === "delete") {
      const { conversation_id } = await req.json();
      await supabase.from("conversations").delete().eq("id", conversation_id);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 4. Send Message & Groq Generation
    const {
      message,
      conversation_id,
      jurisdiction = "Nigerian Law",
      mode = "prep",
    } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "Please enter a legal inquiry." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Create / Update Conversation
    let convId = conversation_id;
    if (!convId) {
      const title = message.length > 35 ? message.substring(0, 35) + "..." : message;
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

    // Native Search
    const legalContext = await searchLegalDocs(message, jurisdiction);

    let stageDirective = "";
    if (mode === "prep") {
      stageDirective = "Focus on structured IRAC legal analysis (Issue, Rule, Application, Conclusion). Spot key legal issues.";
    } else if (mode === "training") {
      stageDirective = "Act as senior counsel. Critique the user's draft, point out statutory weaknesses, and offer suggestions.";
    } else if (mode === "practice") {
      stageDirective = "Draft precise legal clauses or contract sections using formal jurisdiction-specific language.";
    }

    const systemPrompt = `You are LexAI, a high-level legal intelligence counsel.

JURISDICTION: ${jurisdiction}

PRIMARY OBJECTIVE:
${stageDirective}

KNOWLEDGE BASE:
${legalContext || "Rely on standard statutory frameworks and legal principles applicable to this jurisdiction."}

GUIDELINES:
- Provide structured, formal, and authoritative responses.
- Use numbered points and bold headings.
- Reference applicable statutes, rules, and precedents.
- Do not mention technical system processes or embedding functions.`;

    // Fast Groq Inference
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const reply = completion.choices[0]?.message?.content || "Unable to complete legal analysis at this time.";

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
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
