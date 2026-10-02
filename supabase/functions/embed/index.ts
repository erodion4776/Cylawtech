import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

// Built-in Native Supabase Embedding Model
// @ts-ignore
const model = new Supabase.ai.Session("gte-small");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== Deno.env.get("ADMIN_KEY")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { text, site = "lexai", context = "general", metadata = {} } = await req.json();

    if (!text || text.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Document content too short." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const chunks = text
      .split(/\n\n+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 80);

    let indexed = 0;
    for (const chunk of chunks) {
      try {
        const rawEmbedding = await model.run(chunk.substring(0, 1000), {
          mean_pool: true,
          normalize: true,
        });
        const embedding = Array.from(rawEmbedding);

        const { error } = await supabase.from("documents").insert({
          content: chunk,
          embedding,
          site,
          context,
          metadata,
        });

        if (!error) indexed++;
      } catch (err) {
        console.error("Chunk indexing error:", err);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${indexed} of ${chunks.length} sections into the statutory library.`,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Failed to index document." }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
