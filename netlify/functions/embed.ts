import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Helper: Remote embedding via Gemini if key is provided (0ms Edge CPU usage)
async function getRemoteGeminiEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
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
    const expectedKey = Deno.env.get("ADMIN_KEY");

    if (!expectedKey) {
      return new Response(
        JSON.stringify({ error: "Server Configuration Error: ADMIN_KEY is not set in Supabase secrets." }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (adminKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid Admin Key." }),
        { status: 403, headers: corsHeaders }
      );
    }

    const { text, site = "lexai", context = "general", metadata = {} } = await req.json();

    if (!text || text.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Document content is empty or too short." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanText = text.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    // CPU Optimization: Split into a maximum of 2-3 large semantic sections (never loop 10+ times)
    const rawParagraphs = cleanText.split(/\n\n+/).map((p: string) => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    
    let currentChunk = "";
    for (const p of rawParagraphs) {
      if ((currentChunk + "\n" + p).length < 1200) {
        currentChunk = currentChunk ? `${currentChunk}\n${p}` : p;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = p;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    // Limit to max 3 chunks per upload to guarantee CPU stays well under the 2000ms limit
    const targetChunks = chunks.slice(0, 3);

    let indexed = 0;

    // Route 1: 0ms CPU Remote Embedding if GEMINI_API_KEY is available
    if (geminiKey) {
      for (const chunk of targetChunks) {
        const embedding = await getRemoteGeminiEmbedding(chunk, geminiKey);
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
    } 
    // Route 2: Lightweight Native Supabase AI (Capped to prevent CPU spikes)
    else {
      // @ts-ignore
      const session = new Supabase.ai.Session("gte-small");
      for (const chunk of targetChunks) {
        try {
          const rawEmbedding = await session.run(chunk.substring(0, 800), {
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
        } catch (sessionErr: any) {
          console.error("Local session embedding error:", sessionErr.message);
          break;
        }
      }
    }

    if (indexed === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to store document. Check database table schema or dimensions." }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${indexed} knowledge section(s) into the statutory library.`,
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Critical Ingestion Failure:", error);
    return new Response(
      JSON.stringify({ error: `Ingestion failure: ${error.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
