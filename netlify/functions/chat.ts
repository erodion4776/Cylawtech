import { Handler } from '@netlify/functions';
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";

// Initialize AI Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const hf = new HfInference(process.env.HF_TOKEN || 'dummy');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

console.log("LexAI Chat Function Initialized", {
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  hasGeminiKey: !!process.env.GEMINI_API_KEY
});

async function getEmbedding(text: string) {
  // Try Gemini First
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`Generating embedding for text: ${text.substring(0, 50)}...`);
      const result = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: [text]
      });
      
      if (result.embeddings && result.embeddings.length > 0) {
        console.log("Gemini embedding generated successfully.");
        return result.embeddings[0].values;
      }
    } catch (gemError: any) {
      console.warn("Gemini Embedding (Chat) failed, trying fallback:", gemError.message);
    }
  }

  // Fallback to Hugging Face
  if (process.env.HF_TOKEN) {
    try {
      const result = await hf.featureExtraction({
        model: "sentence-transformers/all-mpnet-base-v2",
        inputs: text,
      });
      if (Array.isArray(result)) {
        console.log("Hugging Face embedding generated successfully as fallback.");
        return result as number[];
      }
    } catch (hfError: any) {
      console.error("Hugging Face Embedding (Chat) also failed:", hfError.message);
    }
  }

  return null;
}

export const handler: Handler = async (event) => {
  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-admin-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle Preflight (OPTIONS)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { message, jurisdiction, stage, editorContent, site, context: userContext } = body;
    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];

    if (!message) return { statusCode: 400, headers, body: JSON.stringify({ error: "Message is required" }) };

    const isInternal = !apiKey;
    const targetSite = site || 'lexai';

    if (!isInternal && !site) {
       return { statusCode: 400, headers, body: JSON.stringify({ error: "Site identifier is required" }) };
    }

    // 0. Check global settings and API key validity
    const settingsRes = await supabase.from('settings').select('*').single();

    if (settingsRes.error) {
      console.error("Settings Lookup Error:", settingsRes.error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Database error fetching settings", details: settingsRes.error.message }) };
    }

    if (!settingsRes.data?.api_enabled) {
      console.warn("API is disabled in settings.");
      return { statusCode: 503, headers, body: JSON.stringify({ error: "API is currently disabled by administrator" }) };
    }

    if (!isInternal) {
      const keyRes = await supabase.from('api_keys').select('*').eq('key', apiKey as string).eq('site', site).eq('status', 'active').single();
      if (keyRes.error || !keyRes.data) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: "Invalid API key" }) };
      }
    }

    const activeModel = settingsRes.data.active_model || 'gemini-1.5-flash';
    
    // 1. Get relevant documents
    // Use the site-specific RPC version
    const queryEmbedding = await getEmbedding(message);
    if (!queryEmbedding) {
      console.warn("[CHAT FUNCTION] Could not generate embedding, check API keys.");
    }
    let context = "";
    let debugInfo = {
      queryEmbeddingGenerated: !!queryEmbedding,
      matchesFound: 0,
      matches: [] as any[]
    };

    // 1. Try search across all documents
    let matches: any[] = [];
    if (queryEmbedding) {
      console.log(`[CHAT FUNCTION] RPC call: match_site_documents. Site: all, Context: ""`);
      const { data: allMatches, error: rpcError } = await supabase.rpc('match_site_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.01,
          match_count: 10,
          p_site: 'all',
          p_context: ''
      });
      
      if (rpcError) {
          console.error(`[CHAT FUNCTION] RPC error:`, rpcError);
      }
      
      if (!rpcError && allMatches && allMatches.length > 0) {
          matches = allMatches;
          console.log(`[CHAT FUNCTION] Found ${matches.length} matches across all sites`);
      }
    }

    if (matches.length > 0) {
        debugInfo.matchesFound = matches.length;
        debugInfo.matches = matches;
        context = matches.map((m: any) => m.content).join('\n\n---\n\n');
    }
      
    const hasPremiumTag = message.toLowerCase().includes("incorporate") || message.toLowerCase().includes("tax") || message.toLowerCase().includes("memo") || message.toLowerCase().includes("guide");
    
    let stageInstructions = "";
    if (stage === 'prep') {
      stageInstructions = "Focus on IRAC frameworks and issue-spotting drills. Help the user structure their thoughts.";
    } else if (stage === 'training') {
      stageInstructions = `CRITIQUE MODE: Review the following text from the user's document editor and provide mentor-style feedback: "${editorContent || 'No content yet'}".`;
    } else if (stage === 'practice') {
      stageInstructions = "Provide templates for real-world memos and contracts. Guide the user through the drafting process.";
    }

    const systemPrompt = `
You are a professional legal assistant representing LexAI Workspace.

ROLE:
- Respond as a qualified legal intelligence assistant.
- Maintain a formal, precise, and authoritative tone, but be polite and conversational for general greetings.

CONVERSATION & GREETINGS:
- If the user is just saying hello, greeting you, or asking a general non-legal question, respond politely and ask how you can assist them with legal matters today. You do not need to restrict yourself to the context for simple greetings.

STRICT KNOWLEDGE RULE (For Legal Queries):
- When answering legal questions, you MUST answer ONLY using the provided context.
- Do NOT use general knowledge for legal questions.
- Do NOT make assumptions.
- Do NOT introduce external legal systems or jurisdictions unless explicitly stated in the context.

JURISDICTION RULE:
- Do NOT assume any jurisdiction.
- Only rely on jurisdiction if it is clearly stated in the provided documents.

GROUNDING RULE:
- Every legal response must be directly supported by the provided context.
- Where applicable, refer explicitly to the context.
- If the answer cannot be derived from the context, do NOT guess.

IF INFORMATION IS NOT AVAILABLE:
- Respond ONLY with:
"This matter requires specific legal advice or more information. I cannot provide a definitive answer based on the current context."

STYLE:
- Professional and formal
- Clear and concise
- No storytelling
- No teaching or mentoring tone
- No motivational or conversational language (except for greetings)

FORMAT:
- Start with a direct answer
- Use numbered points or bullet points where appropriate
- Keep responses structured and easy to read

CONTEXT:
${context}

QUESTION:
${message}
    
    ${hasPremiumTag ? "At the end of your response, naturally recommend our enterprise solutions available by contacting us." : ""}`;

    let responseText = "";

    // MULTI-TIER AI FALLBACK SYSTEM
    // Tier 1: Primary Model (Admin Selected or Gemini Default)
    // Tier 2: Groq Fallback
    // Tier 3: Hugging Face Fallback

    const report: string[] = [];

    const tryGemini = async (modelName: string) => {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy') {
        report.push(`Gemini (${modelName}): Missing GEMINI_API_KEY`);
        return null;
      }
      try {
        console.log(`Attempting Gemini (${modelName})...`);
        const result = await ai.models.generateContent({
          model: modelName || 'gemini-3-flash-preview',
          contents: systemPrompt + "\n\nUser: " + message
        });
        return result.text;
      } catch (e: any) {
        report.push(`Gemini (${modelName}): ${e.message}`);
        console.warn(`Gemini (${modelName}) failed:`, e.message);
        return null;
      }
    };

    const tryGroq = async () => {
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy') {
        report.push("Groq: Missing GROQ_API_KEY");
        return null;
      }
      try {
        console.log("Attempting Groq (mixtral-8x7b-32768)...");
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          model: "mixtral-8x7b-32768",
        });
        return completion.choices[0]?.message?.content || null;
      } catch (e: any) {
        report.push(`Groq: ${e.message}`);
        console.warn("Groq failed:", e.message);
        return null;
      }
    };

    const tryHuggingFace = async () => {
      if (!process.env.HF_TOKEN || process.env.HF_TOKEN === 'dummy') {
        report.push("Hugging Face: Missing HF_TOKEN");
        return null;
      }
      try {
        console.log("Attempting Hugging Face (Mistral-7B-Instruct-v0.2)...");
        const result = await hf.textGeneration({
          model: 'mistralai/Mistral-7B-Instruct-v0.2',
          inputs: `<s>[INST] ${systemPrompt} \n\n User Message: ${message} [/INST]`,
          parameters: { max_new_tokens: 1000 }
        });
        let text = result.generated_text || "";
        if (text.includes('[/INST]')) {
          text = text.split('[/INST]').pop()?.trim() || text;
        }
        return text;
      } catch (e: any) {
        report.push(`Hugging Face: ${e.message}`);
        console.warn("Hugging Face failed:", e.message);
        return null;
      }
    };

    try {
      // 1. Primary Attempt
      if (activeModel.includes('groq')) {
        responseText = await tryGroq() || "";
      } else {
        responseText = await tryGemini(activeModel) || "";
      }

      // 2. Secondary Attempt (Gemini Flash)
      if (!responseText && activeModel !== 'gemini-3-flash-preview') {
        responseText = await tryGemini('gemini-3-flash-preview') || "";
      }

      // 3. Tertiary Attempt (Groq fallback if not primary)
      if (!responseText && !activeModel.includes('groq')) {
        responseText = await tryGroq() || "";
      }

      // 4. Quaternary Attempt (Hugging Face)
      if (!responseText) {
        responseText = await tryHuggingFace() || "";
      }

    } catch (criticalError: any) {
      console.error("Critical Failure in AI Fallback Chain:", criticalError);
      report.push(`Critical Chain Error: ${criticalError.message}`);
    }

    if (!responseText) {
       console.error("No responseText found. Returning error. debugInfo:", JSON.stringify(debugInfo));
       return {
         statusCode: 500,
         headers,
         body: JSON.stringify({
           error: "All AI providers failed. Check your API keys in Netlify.",
           report: report,
           debugInfo
         })
       };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: responseText, debugInfo })
    };
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Failed to process chat request", 
        details: error.message || String(error),
        debugInfo: { error: "General chat error" } 
      })
    };
  }
};
