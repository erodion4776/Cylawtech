-- SQL schema for LexAI SaaS Admin
-- You can run this in your Supabase SQL Editor

-- 1. Table for global system settings
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_enabled BOOLEAN DEFAULT true,
    active_model TEXT DEFAULT 'gemini-1.5-flash',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert initial settings if not exists
INSERT INTO public.settings (api_enabled, active_model)
SELECT true, 'gemini-1.5-flash'
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- 2. Table for API Keys (Client management)
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    site TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ensure 'documents' table supports multi-site RAG
-- If your documents table already exists, verify these columns:
-- ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS site TEXT;
-- ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS context TEXT DEFAULT 'general';

-- 4. RPC for site-specific matching
CREATE OR REPLACE FUNCTION match_site_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_site text,
  p_context text DEFAULT 'general'
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
    AND (d.metadata->>'site' = p_site OR d.site = p_site) -- Handle both metadata or column
    AND (d.metadata->>'context' = p_context OR d.context = p_context)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
