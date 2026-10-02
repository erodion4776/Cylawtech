import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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
        JSON.stringify({ error: "Server Configuration Error: ADMIN_KEY is not configured in Supabase secrets." }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (adminKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Master Admin Key mismatch." }),
        { status: 403, headers: corsHeaders }
      );
    }

    const { text, site = "nigeria", context = "general", metadata = {} } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Please enter valid statutory text or legal excerpt." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Split paragraphs cleanly
    const rawSections = text
      .split(/\n\n+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 5);

    if (rawSections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No readable content found in text." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Build batch insert payload
    const records = rawSections.map((section: string) => {
      // Derive clean title from the first 50 characters
      const firstLine = section.split("\n")[0].trim();
      const title = firstLine.length > 60 ? firstLine.substring(0, 60) + "..." : firstLine;

      return {
        title,
        content: section,
        site,
        context,
        metadata: {
          ...metadata,
          uploaded_at: new Date().toISOString()
        }
      };
    });

    // Single high-speed batch database insertion (< 20ms)
    const { data, error: insertError } = await supabase
      .from("documents")
      .insert(records)
      .select("id");

    if (insertError) {
      console.error("Database error during document batch insert:", insertError);
      return new Response(
        JSON.stringify({ error: `Database Error: ${insertError.message}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    const insertedCount = data ? data.length : records.length;

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${insertedCount} legal section(s) into the statutory library.`,
        count: insertedCount
      }),
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Critical Ingest Failure:", error);
    return new Response(
      JSON.stringify({ error: `Failed to index: ${error.message || "Unknown error"}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
