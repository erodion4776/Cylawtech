import { Handler } from '@netlify/functions';
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import pdfParser from "pdf-parse-debugging-disabled";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  
  console.log(`Admin Request: ${event.httpMethod} ${event.path}`);

  const adminKey = event.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    console.error("ADMIN_KEY environment variable is NOT SET in Netlify.");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfiguration: No admin key set" }) };
  }

  if (adminKey !== expectedKey) {
    console.warn(`Unauthorized admin access attempt. Provided key: ${adminKey?.substring(0, 4)}...`);
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Forbidden: Invalid Admin Key" }) };
  }

  const fullPath = event.path;
  // Extract the part after /admin/
  let path = '';
  if (fullPath.includes('/admin/')) {
    path = fullPath.split('/admin/')[1] || '';
  } else if (fullPath.endsWith('/admin')) {
    path = '';
  }
  
  // Remove trailing slashes and clean up
  path = path.replace(/\/$/, '');
  
  const method = event.httpMethod;

  try {
    // GET settings
    if (method === 'GET' && (path === 'settings' || path === '')) {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // PATCH settings
    if (method === 'PATCH' && path === 'settings') {
      const body = JSON.parse(event.body || '{}');
      const { data, error } = await supabase
        .from('settings')
        .update({ ...body, updated_at: new Date() })
        .match({ id: body.id })
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // GET keys
    if (method === 'GET' && path === 'keys') {
      const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // POST keys
    if (method === 'POST' && path === 'keys') {
      const { site } = JSON.parse(event.body || '{}');
      const newKey = `lex_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
      const { data, error } = await supabase
        .from('api_keys')
        .insert({ key: newKey, site, status: 'active' })
        .select()
        .single();
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE keys/:id
    if (method === 'DELETE' && path.startsWith('keys/')) {
      const id = path.split('/')[1];
      const { error } = await supabase.from('api_keys').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ message: "Key revoked" }) };
    }

    // GET documents
    if (method === 'GET' && path === 'documents') {
      const { data, error } = await supabase.from('documents').select('id, content, site, context, metadata').limit(100);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // DELETE documents/:id
    if (method === 'DELETE' && path.startsWith('documents/')) {
      const id = path.split('/')[1];
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ message: "Document deleted" }) };
    }

    // GET test-db
    if (method === 'GET' && path === 'test-db') {
      const diagnostics: any = {
        supabase: {
          url: supabaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
          status: 'unknown'
        },
        tables: {},
        embedding_check: 'none'
      };

      try {
        // Check documents table schema and count
        const { count: docCount, error: docError } = await supabase.from('documents').select('*', { count: 'exact', head: true });
        const { error: selectError } = await supabase.from('documents').select('id, content, embedding, site, context').limit(0);
        
        diagnostics.tables.documents = {
          status: docError ? 'error' : 'ok',
          count: docCount,
          schema: selectError ? { status: 'missing_columns', error: selectError.message } : 'ok'
        };
        
        // Check api_keys table
        const { count: keyCount, error: keyError } = await supabase.from('api_keys').select('*', { count: 'exact', head: true });
        diagnostics.tables.api_keys = keyError ? { status: 'error', error: keyError } : { status: 'ok', count: keyCount };

        // Check Settings table
        const { count: setCount, error: setError } = await supabase.from('settings').select('*', { count: 'exact', head: true });
        diagnostics.tables.settings = setError ? { status: 'error', error: setError } : { status: 'ok', count: setCount };

        // Test PDF Parser load
        try {
          let pdf: any = pdfParser;
          if (typeof pdf !== 'function' && pdf && typeof (pdf as any).default === 'function') {
            pdf = (pdf as any).default;
          }
          const loaded = typeof pdf === 'function';
          diagnostics.pdf_parser = { 
            status: 'ok', 
            loaded, 
            type: typeof pdfParser,
            hasDefault: !!(pdfParser as any)?.default,
            isFunction: typeof pdfParser === 'function'
          };
        } catch (pdfErr: any) {
          diagnostics.pdf_parser = { status: 'error', error: pdfErr.message };
        }

        // Test Gemini Embedding
        try {
          const aiModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
          const model = aiModel.getGenerativeModel({ model: "text-embedding-004" });
          const res = await model.embedContent("Diagnostic test");
          if (res.embedding) {
            diagnostics.gemini = { status: 'ok', dimension: res.embedding.values.length };
          } else {
            diagnostics.gemini = { status: 'error', error: 'No embedding returned' };
          }
        } catch (gemErr: any) {
          diagnostics.gemini = { status: 'error', error: gemErr.message };
        }

        // Test insertion of a dummy vector (768 dimensions)
        const dummyVector = new Array(768).fill(0);
        const { error: insertError } = await supabase.from('documents').insert({
          content: 'DIAGNOSTIC_TEST_ENTRY_TO_DELETE',
          embedding: dummyVector,
          site: 'diagnostic',
          context: 'test'
        });

        if (insertError) {
          diagnostics.embedding_check = { 
            status: 'failed', 
            error: insertError.message, 
            code: insertError.code,
            hint: insertError.hint || 'Dimension mismatch? (Table might expect 1536)' 
          };
        } else {
          diagnostics.embedding_check = { status: 'ok', message: '768-dimension vector accepted' };
          // Cleanup
          await supabase.from('documents').delete().eq('content', 'DIAGNOSTIC_TEST_ENTRY_TO_DELETE');
        }

        diagnostics.supabase.status = 'connected';
      } catch (err: any) {
        diagnostics.supabase.status = 'failed';
        diagnostics.supabase.error = err.message;
      }

      return { statusCode: 200, headers, body: JSON.stringify(diagnostics) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Endpoint not found", path }) };
  } catch (error: any) {
    console.error("Admin Function Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "Internal Server Error" }) };
  }
};
