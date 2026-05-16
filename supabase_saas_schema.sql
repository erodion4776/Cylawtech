-- SQL schema for LexAI SaaS Admin
-- RUN THIS IN YOUR SUPABASE SQL EDITOR

-- 0. Enable Vector Extension (REQUIRED for AI features)
CREATE EXTENSION IF NOT EXISTS vector;

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

-- 3. Knowledge Base Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(768),
    site TEXT DEFAULT 'global',
    context TEXT DEFAULT 'general',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_documents_site ON public.documents(site);
CREATE INDEX IF NOT EXISTS idx_documents_context ON public.documents(context);

-- 4. RPC Search Function (Crucial for AI Chat)
CREATE OR REPLACE FUNCTION match_site_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_site text,
  p_context text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $func$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE d.embedding IS NOT NULL
    AND (p_site = 'all' OR d.site = p_site OR d.site = 'global')
    AND (p_context IS NULL OR p_context = '' OR d.context = p_context)
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$func$;

