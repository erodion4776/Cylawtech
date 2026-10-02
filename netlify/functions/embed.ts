import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import Groq from "https://esm.sh/groq-sdk@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminKey = req.headers.get("x-admin-key");
    const expectedKey = Deno.env.get("ADMIN_KEY");

    if (!expectedKey) {
      return new Response(
        JSON.stringify({ error: "Configuration Error: ADMIN_KEY is not set in Supabase secrets." }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (adminKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid Admin Key." }),
        { status: 403, headers: corsHeaders }
      );
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      return new Response(
        JSON.stringify({ error: "Configuration Error: GROQ_API_KEY is missing." }),
        { status: 500, headers: corsHeaders }
      );
    }

    const { text, site = "nigeria", context = "general", metadata = {} } = await req.json();

    if (!text || text.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Document content is empty or too short." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const groq = new Groq({ apiKey: groqKey });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Split paragraphs
    const rawChunks = text
      .split(/\n\n+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 10);

    let indexedCount = 0;

    for (const chunk of rawChunks) {
      // Fast Groq extraction for title & key legal principles
      let title = "Statutory Excerpt";
      try {
        const titleExtraction = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: "Extract a short 3-6 word legal title/topic for this text excerpt. Output ONLY the title, nothing else."
            },
            { role: "user", content: chunk.substring(0, 300) }
          ],
          max_tokens: 30,
          temperature: 0.1,
        });
        title = titleExtraction.choices[0]?.message?.content?.replace(/["']/g, "") || title;
      } catch {
        // Default fallback if rate limited
        title = chunk.substring(0, 40) + "...";
      }

      const { error } = await supabase.from("documents").insert({
        title,
        content: chunk,
        site,
        context,
        metadata: {
          ...metadata,
          indexed_by: "Groq Llama 3.1",
          uploaded_at: new Date().toISOString()
        },
      });

      if (!error) indexedCount++;
    }

    if (indexedCount === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to store document in database." }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${indexedCount} legal section(s) into the statutory library.`,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Ingestion Failure:", error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
