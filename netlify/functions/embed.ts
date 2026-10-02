const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // Handle CORS Preflight
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

    const body = await req.json().catch(() => null);
    if (!body || !body.text || typeof body.text !== "string" || body.text.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Please enter valid statutory text or legal excerpt." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { text, site = "nigeria", context = "general", metadata = {} } = body;

    // Clean paragraph segmentation
    const rawSections = text
      .split(/\n\n+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 3);

    const records = rawSections.map((section: string) => {
      const firstLine = section.split("\n")[0].trim();
      const title = firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;
      return {
        title,
        content: section,
        site,
        context,
        metadata: {
          ...metadata,
          uploaded_at: new Date().toISOString(),
        },
      };
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Direct, ultra-fast HTTP insert to PostgREST (0ms CPU)
    const dbResponse = await fetch(`${supabaseUrl}/rest/v1/documents`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(records),
    });

    if (!dbResponse.ok) {
      const errorText = await dbResponse.text();
      console.error("Database Insert Error:", errorText);
      return new Response(
        JSON.stringify({ error: `Database Error: ${errorText}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    const insertedData = await dbResponse.json();
    const count = Array.isArray(insertedData) ? insertedData.length : records.length;

    return new Response(
      JSON.stringify({
        message: `Successfully indexed ${count} legal section(s) into the statutory library.`,
        count,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Critical Ingestion Failure:", error);
    return new Response(
      JSON.stringify({ error: `Ingestion failed: ${error.message || "Unknown error"}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});
