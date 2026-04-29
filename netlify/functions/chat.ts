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
  try {
    console.log(`Generating embedding for text: ${text.substring(0, 50)}...`);
    const model = ai.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    
    if (result.embedding && result.embedding.values) {
      console.log("Embedding generated successfully.");
      return result.embedding.values;
    }
    console.error("No embeddings found in result.");
    return null;
  } catch (error) {
    console.error("Embedding generation error in chat.ts:", error);
    return null;
  }
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
    if (!site) return { statusCode: 400, headers, body: JSON.stringify({ error: "Site identifier is required" }) };
    if (!apiKey) return { statusCode: 401, headers, body: JSON.stringify({ error: "API Key required" }) };

    // 0. Check global settings and API key validity
    console.log(`Checking API Key: ${apiKey?.toString().substring(0, 8)}... for site: ${site}`);
    
    const [settingsRes, keyRes] = await Promise.all([
      supabase.from('settings').select('*').single(),
      supabase.from('api_keys').select('*').eq('key', apiKey as string).eq('site', site).eq('status', 'active').single()
    ]);

    if (settingsRes.error) {
      console.error("Settings Lookup Error:", settingsRes.error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Database error fetching settings", details: settingsRes.error.message }) };
    }

    if (!settingsRes.data?.api_enabled) {
      console.warn("API is disabled in settings.");
      return { statusCode: 503, headers, body: JSON.stringify({ error: "API is currently disabled by administrator" }) };
    }

    if (keyRes.error) {
      console.error("API Key Lookup Error:", keyRes.error);
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Invalid or revoked API key for this site", details: keyRes.error.message }) };
    }

    if (!keyRes.data) {
      console.warn("No active API key found for this site/key combination.");
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Invalid API key" }) };
    }

    console.log("API Key validated successfully for site:", site);
    const activeModel = settingsRes.data.active_model || 'gemini-1.5-flash';
    
    // 1. Get relevant documents
    // Use the site-specific RPC version
    const queryEmbedding = await getEmbedding(message);
    let context = "";
    if (queryEmbedding) {
      const { data: matches, error: rpcError } = await supabase.rpc('match_site_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 5,
        p_site: site,
        p_context: jurisdiction || 'general'
      });
      if (!rpcError && matches) {
        context = matches.map((m: any) => m.content).join('\n\n---\n\n');
      }
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

    const systemPrompt = `You are a supportive, knowledgeable legal mentor. 
    Personality: Conversational, relatable, no heavy jargon. Focus on teaching 'how to think'.
    Jurisdiction: ${jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Law'}.
    Current Stage: ${stage}.
    ${stageInstructions}
    
    Use the following context to answer: ${context}.
    ${hasPremiumTag ? "At the end of your response, naturally recommend our 'Premium Legal Drafting Guide' available in the Resource Store for $49.99." : ""}`;

    let responseText = "";

    // MULTI-TIER AI FALLBACK SYSTEM
    // Tier 1: Primary Model (Admin Selected or Gemini Default)
    // Tier 2: Groq Fallback
    // Tier 3: Hugging Face Fallback

    const tryGemini = async (model: string) => {
      console.log(`Attempting Gemini (${model})...`);
      const genModel = ai.getGenerativeModel({ model: model || 'gemini-1.5-flash' });
      const result = await genModel.generateContent(systemPrompt + "\n\nUser: " + message);
      return result.response.text();
    };

    const tryGroq = async () => {
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy') return null;
      console.log("Attempting Groq (mixtral-8x7b-32768)...");
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        model: "mixtral-8x7b-32768",
      });
      return completion.choices[0]?.message?.content || null;
    };

    const tryHuggingFace = async () => {
      if (!process.env.HF_TOKEN || process.env.HF_TOKEN === 'dummy') return null;
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
    };

    try {
      // 1. Primary Attempt (Usually Gemini or specific Groq model)
      try {
        if (activeModel.includes('groq')) {
          responseText = await tryGroq() || "";
        } else {
          responseText = await tryGemini(activeModel) || "";
        }
      } catch (e: any) {
        console.warn("Primary AI Tier failed:", e.message);
      }

      // 2. Secondary Attempt (Gemini Flash if primary was something else/failed)
      if (!responseText) {
        try {
          responseText = await tryGemini('gemini-1.5-flash');
        } catch (e: any) {
          console.warn("Secondary AI Tier (Gemini Flash) failed:", e.message);
        }
      }

      // 3. Tertiary Attempt (Groq)
      if (!responseText) {
        try {
          responseText = await tryGroq() || "";
        } catch (e: any) {
          console.warn("Tertiary AI Tier (Groq) failed:", e.message);
        }
      }

      // 4. Quaternary Attempt (Hugging Face)
      if (!responseText) {
        try {
          responseText = await tryHuggingFace() || "";
        } catch (e: any) {
          console.warn("Quaternary AI Tier (Hugging Face) failed:", e.message);
        }
      }

    } catch (criticalError: any) {
      console.error("Critical Failure in AI Fallback Chain:", criticalError);
    }

    if (!responseText) {
       throw new Error("All AI providers are currently unavailable. Our engineers have been notified.");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: responseText })
    };
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Failed to process chat request", 
        details: error.message || String(error)
      })
    };
  }
};
