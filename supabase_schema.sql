-- 1. Enable pgvector extension for vector embeddings
create extension if not exists vector;

-- 2. Create the documents table
create table if not exists documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(768) -- Matches Gemini text-embedding-004 dimensions
);

-- 3. Create a function for vector similarity search
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter jsonb default '{}'
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where (documents.metadata @> filter) -- Filter by jurisdiction or other metadata
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- 4. Set up row level security (optional but recommended)
-- alter table documents enable row level security;
