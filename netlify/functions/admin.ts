import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminKey = req.headers.get("x-admin-key");
  const expectedKey = Deno.env.get("ADMIN_KEY");

  if (!expectedKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration: ADMIN_KEY not set in secrets." }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (adminKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Forbidden: Invalid Admin Key" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/admin/")[1] || "";
  const method = req.method;

  try {
    // ==========================================
    // SETTINGS
    // ==========================================
    if (method === "GET" && (path === "settings" || path === "")) {
      const { data } = await supabase.from("settings").select("*").single();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "PATCH" && path === "settings") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("settings")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // ==========================================
    // CLIENT FIRM KEYS
    // ==========================================
    if (method === "GET" && path === "keys") {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify(data || []), { headers: corsHeaders });
    }

    if (method === "POST" && path === "keys") {
      const { site } = await req.json();
      const key = `lex_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data, error } = await supabase
        .from("api_keys")
        .insert({ key, site, status: "active" })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "DELETE" && path.startsWith("keys/")) {
      const id = path.split("/")[1];
      const { error } = await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ message: "Access revoked" }), { headers: corsHeaders });
    }

    // ==========================================
    // STATUTORY DOCUMENTS (KNOWLEDGE BASE)
    // ==========================================
    if (method === "GET" && path === "documents") {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, content, site, context, metadata")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return new Response(JSON.stringify(data || []), { headers: corsHeaders });
    }

    // Direct Knowledge Ingestion (Instant Batch Insert in ~10ms)
    if (method === "POST" && (path === "documents" || path === "embed")) {
      const { text, site = "nigeria", context = "general", metadata = {} } = await req.json();

      if (!text || typeof text !== "string" || text.trim().length < 5) {
        return new Response(JSON.stringify({ error: "Please provide valid legal text." }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const rawSections = text
        .split(/\n\n+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 5);

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

      const { data, error } = await supabase.from("documents").insert(records).select("id");
      if (error) throw error;

      const count = data ? data.length : records.length;
      return new Response(
        JSON.stringify({
          message: `Successfully indexed ${count} section(s) into the statutory library.`,
          count,
        }),
        { headers: corsHeaders }
      );
    }

    if (method === "DELETE" && path.startsWith("documents/")) {
      const id = path.split("/")[1];
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ message: "Document removed" }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error("Admin Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
