import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// @ts-ignore
const model = new Supabase.ai.Session("gte-small");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminKey = req.headers.get("x-admin-key");
    const expectedKey = Deno.env.get("ADMIN_KEY");

    if (!expectedKey) {
      return new Response(JSON.stringify({ error: "Server Configuration Error: ADMIN_KEY is not set in Supabase secrets." }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (adminKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized: Master Admin Key mismatch." }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { text, site = "lexai", context = "general", metadata = {} } = await req.json();

    if (!text || text.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Document content is empty or too short." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Split paragraphs cleanly
    const chunks = text
      .split(/\n\n+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 5);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    let indexed = 0;
    let dbErrorDetails = "";

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

        if (error) {
          dbErrorDetails = `Database Insert Failed: ${error.message} (Code: ${error.code}). Hint: ${error.hint || 'none'}`;
          console.error(dbErrorDetails);
          break;
        } else {
          indexed++;
        }
      } catch (err: any) {
        dbErrorDetails = `Embedding/Generation Error: ${err.message}`;
        console.error(dbErrorDetails);
        break;
      }
    }

    if (indexed === 0 && dbErrorDetails) {
      return new Response(JSON.stringify({ error: dbErrorDetails }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${indexed} of ${chunks.length} sections into the statutory library.`,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Critical Ingestion Failure:", error);
    return new Response(JSON.stringify({ error: `Critical failure: ${error.message}` }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
