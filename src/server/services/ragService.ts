import { supabase } from "../config/supabase.ts";
import { getEmbedding } from "./embeddingService.ts";

export const getRelevantDocs = async (message: string, context: string, site: string) => {
  try {
    const embedding = await getEmbedding(message);
    if (!embedding) {
      console.warn("Could not generate embedding for message");
      return "";
    }

    console.log(`[RAG BRIDGE] Searching for docs: site='${site}', context='${context}'`);
    let results: any[] = [];
    
    // Validate embedding existence
    if (!embedding || embedding.length === 0) {
      console.warn("[RAG BRIDGE] Embedding is null or empty. Search aborted.");
      return "";
    }

    // Try site-specific RPC first
    const { data: siteMatches, error: siteError } = await supabase.rpc('match_site_documents', {
      query_embedding: embedding,
      match_threshold: 0.01, 
      match_count: 10,
      p_site: site,
      p_context: context
    });

    if (siteMatches && siteMatches.length > 0) {
      console.log(`[RAG BRIDGE] Found ${siteMatches.length} site-specific matches.`);
      results = siteMatches;
    } else {
      console.log(`[RAG BRIDGE] No site-specific matches. Trying fallbacks...`);
      
      // Fallback 1: Try Case-Insensitive / Normalized context
      const normalizedContext = context.charAt(0).toUpperCase() + context.slice(1).toLowerCase();
      if (normalizedContext !== context) {
        const { data: normalizedMatches } = await supabase.rpc('match_site_documents', {
          query_embedding: embedding,
          match_threshold: 0.1,
          match_count: 5,
          p_site: site,
          p_context: normalizedContext
        });
        if (normalizedMatches && normalizedMatches.length > 0) {
          console.log(`[RAG BRIDGE] Found ${normalizedMatches.length} normalized context matches.`);
          results = [...results, ...normalizedMatches];
        }
      }

      // Fallback 1.5: Try site-specific matches REGARDLESS of context
      if (results.length === 0) {
        console.log(`[RAG BRIDGE] No context match for site ${site}. Trying site-wide match...`);
        const { data: siteWideMatches } = await supabase.rpc('match_site_documents', {
          query_embedding: embedding,
          match_threshold: 0.1,
          match_count: 5,
          p_site: site,
          p_context: '' // This might not work if RPC expects exact match, let's try calling match_documents with site filter
        });

        if (siteWideMatches && siteWideMatches.length > 0) {
          results = siteWideMatches;
        } else {
          // Alternative site-wide via match_documents with context ignore
          const { data: alternateSiteMatches } = await supabase.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: 0.1,
            match_count: 5,
            filter: { site }
          });
          if (alternateSiteMatches && alternateSiteMatches.length > 0) {
            results = alternateSiteMatches;
          }
        }
      }

      // Fallback 2: Try 'global' site if we didn't find anything
      if (results.length === 0) {
        const { data: globalMatches } = await supabase.rpc('match_site_documents', {
          query_embedding: embedding,
          match_threshold: 0.1,
          match_count: 5,
          p_site: 'global',
          p_context: 'general'
        });
        if (globalMatches && globalMatches.length > 0) {
          console.log(`[RAG BRIDGE] Found ${globalMatches.length} global site matches.`);
          results = globalMatches;
        }
      }

      // Fallback 3: Generic search across all documents (no site filter)
      if (results.length === 0) {
        console.log(`[RAG BRIDGE] Trying generic search across all documents...`);
        const { data: genericMatches } = await supabase.rpc('match_documents', {
          query_embedding: embedding,
          match_threshold: 0.01, // Extremely low threshold for final vector attempt
          match_count: 5
        });
        if (genericMatches && genericMatches.length > 0) {
          console.log(`[RAG BRIDGE] Found ${genericMatches.length} generic matches.`);
          results = genericMatches;
        }
      }
    }

    // FINAL FALLBACK: Keyword search if vector search yielded nothing
    if (results.length === 0) {
      console.log(`[RAG BRIDGE] Vector search failed completely. Trying keyword fallback...`);
      const words = message.split(' ').filter(w => w.length > 4).slice(0, 3);
      if (words.length > 0) {
        const { data: keywordMatches } = await supabase
          .from('documents')
          .select('id, content, metadata')
          .or(`content.ilike.%${words[0]}%,content.ilike.%${words[1] || words[0]}%`)
          .limit(3);
        
        if (keywordMatches && keywordMatches.length > 0) {
          console.log(`[RAG BRIDGE] Found ${keywordMatches.length} keyword matches.`);
          results = keywordMatches.map(d => ({ ...d, similarity: 0.5 }));
        }
      }
    }

    if (results.length > 0) {
      const uniqueDocs = Array.from(new Set(results.map(r => r.content)));
      console.log(`[RAG BRIDGE] Returning ${uniqueDocs.length} unique docs to AI.`);
      const debugInfo = {
        matchesFound: results.length,
        matches: results.map((r: any) => ({
          site: r.site,
          context: r.context,
          similarity: r.similarity,
          contentPreview: r.content?.substring(0, 50)
        }))
      };
      return { context: uniqueDocs.join("\n---\n"), debugInfo };
    }

    console.warn("[RAG BRIDGE] No documents found after all search attempts.");
    return { context: "", debugInfo: { matchesFound: 0 } };
  } catch (error) {
    console.error("RAG retrieval error:", error);
    return { context: "", debugInfo: { error: "RAG error" } };
  }
};
