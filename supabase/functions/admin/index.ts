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
  if (adminKey !== Deno.env.get("ADMIN_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/admin/")[1] || "";
  const method = req.method;

  try {
    // Settings
    if (method === "GET" && (path === "settings" || path === "")) {
      const { data } = await supabase.from("settings").select("*").single();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "PATCH" && path === "settings") {
      const body = await req.json();
      const { data } = await supabase
        .from("settings")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .select()
        .single();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    // API Keys
    if (method === "GET" && path === "keys") {
      const { data } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "POST" && path === "keys") {
      const { site } = await req.json();
      const key = `lex_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data } = await supabase
        .from("api_keys")
        .insert({ key, site, status: "active" })
        .select()
        .single();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "DELETE" && path.startsWith("keys/")) {
      const id = path.split("/")[1];
      await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id);
      return new Response(JSON.stringify({ message: "Access revoked" }), { headers: corsHeaders });
    }

    // Documents
    if (method === "GET" && path === "documents") {
      const { data } = await supabase
        .from("documents")
        .select("id, content, site, context, metadata")
        .limit(100);
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "DELETE" && path.startsWith("documents/")) {
      const id = path.split("/")[1];
      await supabase.from("documents").delete().eq("id", id);
      return new Response(JSON.stringify({ message: "Document removed" }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
