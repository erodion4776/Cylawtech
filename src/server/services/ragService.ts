import { supabase } from "../config/supabase.ts";
import { getEmbedding } from "./embeddingService.ts";

export const getRelevantDocs = async (message: string, context: string, site: string) => {
  try {
    const embedding = await getEmbedding(message);
    if (!embedding) return "";

    // Using the existing 'match_documents' RPC from supabase_schema.sql
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      filter: { site, context }
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return "";
    }

    return data.map((doc: any) => doc.content).join("\n---\n");
  } catch (error) {
    console.error("RAG retrieval error:", error);
    return "";
  }
};
