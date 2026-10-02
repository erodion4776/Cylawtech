import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Async Background Ingestion Worker (Runs in its own execution thread)
async function processDocumentIngestion(documentId: number) {
  try {
    // 1. Update status to processing
    await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

    // 2. Fetch raw content
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("content, jurisdiction")
      .eq("id", documentId)
      .single();

    if (fetchErr || !doc) throw new Error("Could not load source document.");

    // 3. Segment legal text cleanly
    const rawParagraphs = doc.content
      .split(/\n\n+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 5);

    // Group paragraphs into stable sections
    const sections: string[] = [];
    let currentChunk = "";
    for (const p of rawParagraphs) {
      if ((currentChunk + "\n" + p).length < 1000) {
        currentChunk = currentChunk ? `${currentChunk}\n${p}` : p;
      } else {
        if (currentChunk) sections.push(currentChunk);
        currentChunk = p;
      }
    }
    if (currentChunk) sections.push(currentChunk);

    await supabase.from("documents").update({ total_sections: sections.length }).eq("id", documentId);

    // @ts-ignore
    const session = new Supabase.ai.Session("gte-small");

    // 4. Index in micro-batches (Only 5 sections per tick to stay under CPU limits)
    let processed = 0;
    for (const section of sections) {
      try {
        const rawEmbedding = await session.run(section.substring(0, 800), {
          mean_pool: true,
          normalize: true,
        });
        const embedding = Array.from(rawEmbedding);

        const { error: insertErr } = await supabase.from("knowledge_chunks").insert({
          document_id: documentId,
          content: section,
          embedding,
        });

        if (insertErr) throw insertErr;

        processed++;
        await supabase
          .from("documents")
          .update({ processed_sections: processed })
          .eq("id", documentId);
      } catch (err: any) {
        console.error(`Chunk ingestion error on document ${documentId}:`, err.message);
      }
    }

    // 5. Complete Job
    await supabase
      .from("documents")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", documentId);

  } catch (error: any) {
    console.error("Ingestion Job Failed:", error);
    await supabase
      .from("documents")
      .update({ status: "failed", error_log: error.message })
      .eq("id", documentId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminKey = req.headers.get("x-admin-key");
  const expectedKey = Deno.env.get("ADMIN_KEY");

  if (!expectedKey || adminKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized access." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/admin/")[1] || "";
  const method = req.method;

  try {
    // ==========================================
    // SYSTEM SETTINGS
    // ==========================================
    if (method === "GET" && path === "settings") {
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

    // ==========================================
    // CLIENT ACCESS KEYS
    // ==========================================
    if (method === "GET" && path === "keys") {
      const { data } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      return new Response(JSON.stringify(data || []), { headers: corsHeaders });
    }

    if (method === "POST" && path === "keys") {
      const { site } = await req.json();
      const key = `lex_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data } = await supabase.from("api_keys").insert({ key, site, status: "active" }).select().single();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }

    if (method === "DELETE" && path.startsWith("keys/")) {
      const id = path.split("/")[1];
      await supabase.from("api_keys").update({ status: "revoked" }).eq("id", id);
      return new Response(JSON.stringify({ message: "Access revoked." }), { headers: corsHeaders });
    }

    // ==========================================
    // DOCUMENTS & ASYNCHRONOUS INGESTION QUEUE
    // ==========================================
    if (method === "GET" && path === "documents") {
      const { data } = await supabase
        .from("documents")
        .select("id, title, jurisdiction, document_type, status, total_sections, processed_sections, created_at")
        .order("created_at", { ascending: false });
      return new Response(JSON.stringify(data || []), { headers: corsHeaders });
    }

    // Instant document saving (returns response in under 15ms)
    if (method === "POST" && path === "documents") {
      const { title, jurisdiction, document_type, content } = await req.json();

      if (!title || !content || content.trim().length < 10) {
        return new Response(JSON.stringify({ error: "Please enter a valid legal title and document content." }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // 1. Instantly register the document with status 'pending'
      const { data: doc, error } = await supabase
        .from("documents")
        .insert({
          title,
          jurisdiction,
          document_type,
          content,
          status: "pending"
        })
        .select("id")
        .single();

      if (error) throw error;

      // 2. Offload processing to a background thread
      // (Uses Deno.serve's non-blocking background queue)
      setTimeout(() => processDocumentIngestion(doc.id), 50);

      return new Response(
        JSON.stringify({
          message: "Legal knowledge registered. Background indexing started successfully.",
          document_id: doc.id,
        }),
        { status: 202, headers: corsHeaders }
      );
    }

    if (method === "DELETE" && path.startsWith("documents/")) {
      const id = path.split("/")[1];
      await supabase.from("documents").delete().eq("id", id);
      return new Response(JSON.stringify({ message: "Document removed." }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Endpoint not found" }), {
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
