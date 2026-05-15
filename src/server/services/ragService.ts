import { supabase } from "../config/supabase.ts";
import { getEmbedding } from "./embeddingService.ts";

export const getRelevantDocs = async (message: string, context: string, site: string) => {
  try {
    const embedding = await getEmbedding(message);
    if (!embedding) {
      console.warn("Could not generate embedding for message");
      return "";
    }

    console.log(`Searching for docs: site=${site}, context=${context}`);

    // Try site-specific RPC first
    const { data: siteMatches, error: siteError } = await supabase.rpc('match_site_documents', {
      query_embedding: embedding,
      match_threshold: 0.1, 
      match_count: 5,
      p_site: site,
      p_context: context
    });

    let results = siteMatches || [];

    // Fallback 1: Try Case-Insensitive / Normalized context if siteMatches is empty
    if (results.length === 0 && !siteError) {
      console.log("No exact matches, trying normalized context...");
      const { data: normalizedMatches } = await supabase.rpc('match_site_documents', {
        query_embedding: embedding,
        match_threshold: 0.1,
        match_count: 5,
        p_site: site,
        p_context: context.charAt(0).toUpperCase() + context.slice(1).toLowerCase() // Try 'Nigeria' for 'nigeria'
      });
      if (normalizedMatches && normalizedMatches.length > 0) results = normalizedMatches;
    }

    // Fallback 3: Generic search across all documents (no site filter)
    if (results.length === 0) {
      console.log("No site-specific or global matches, trying generic search...");
      const { data: genericMatches } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.1,
        match_count: 5
      });
      if (genericMatches && genericMatches.length > 0) results = genericMatches;
    }

    if (results.length > 0) {
      console.log(`Found ${results.length} total relevant documents`);
      return results.map((doc: any) => doc.content).join("\n---\n");
    }

    console.log("No documents found after all fallbacks.");
    return "";
  } catch (error) {
    console.error("RAG retrieval error:", error);
    return "";
  }
};
