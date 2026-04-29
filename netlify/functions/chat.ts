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

    const provider = activeModel.includes('groq') ? 'groq' : 'gemini';
    const modelName = activeModel;

    let responseText = "";

    // Fallback chain: Primary (Admin Selected) -> Gemini Fallback
    try {
      if (provider === 'groq' && process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'dummy') {
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          model: modelName,
        });
        responseText = completion.choices[0]?.message?.content || "";
      } else {
        // Use correct Google AI SDK pattern
        const geminiModel = ai.getGenerativeModel({ 
          model: modelName.includes('gemini') ? modelName : 'gemini-1.5-flash' 
        });
        const geminiRes = await geminiModel.generateContent(systemPrompt + "\n\nUser: " + message);
        responseText = geminiRes.response.text();
      }
    } catch (llmError: any) {
      console.error("Primary LLM Error:", llmError);
      
      // Final desperation fallback to a reliable model
      try {
        const fallbackModel = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const finalRes = await fallbackModel.generateContent(systemPrompt + "\n\nUser: " + message);
        responseText = finalRes.response.text();
      } catch (fallbackError: any) {
        console.error("Fallback LLM Error:", fallbackError);
        throw new Error(`AI Service Unavailable: ${fallbackError.message}`);
      }
    }

    if (!responseText) {
       throw new Error("We are currently experiencing high traffic. Please try again in a few moments.");
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
