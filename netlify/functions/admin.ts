import { Handler } from '@netlify/functions';
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  const adminKey = event.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server misconfiguration: No admin key set" }) };
  }

  if (adminKey !== expectedKey) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden: Invalid Admin Key" }) };
  }

  const path = event.path.replace(/\.netlify\/functions\/admin\/?/, '').replace(/\/api\/admin\/?/, '');
  const method = event.httpMethod;

  try {
    // GET settings
    if (method === 'GET' && (path === 'settings' || path === '')) {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify(data) };
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
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    // GET keys
    if (method === 'GET' && path === 'keys') {
      const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify(data) };
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
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    // DELETE keys/:id
    if (method === 'DELETE' && path.startsWith('keys/')) {
      const id = path.split('/')[1];
      const { error } = await supabase.from('api_keys').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ message: "Key revoked" }) };
    }

    // GET documents
    if (method === 'GET' && path === 'documents') {
      const { data, error } = await supabase.from('documents').select('id, content, site, context, metadata').limit(100);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    // DELETE documents/:id
    if (method === 'DELETE' && path.startsWith('documents/')) {
      const id = path.split('/')[1];
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ message: "Document deleted" }) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: "Endpoint not found", path }) };
  } catch (error: any) {
    console.error("Admin Function Error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal Server Error" }) };
  }
};
