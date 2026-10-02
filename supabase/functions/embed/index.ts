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
          content: { parts: [{ text: text.substring(0, 2000) }] },
        }),
      }
    );
    const data = await res.json();
    return data?.embedding?.values || null;
  } catch {
    return null;
  }
}

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
      return new Response(JSON.stringify({ error: "Document content too short" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const chunks = text
      .split(/\n\n+/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 100);

    let indexed = 0;
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      if (embedding) {
        const { error } = await supabase.from("documents").insert({
          content: chunk,
          embedding,
          site,
          context,
          metadata,
        });
        if (!error) indexed++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${indexed} of ${chunks.length} sections into the legal knowledge base.`,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Document processing failed" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
