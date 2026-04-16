import { Handler } from '@netlify/functions';
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";

// Initialize AI Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
const hf = new HfInference(process.env.HF_TOKEN || 'dummy');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getEmbedding(text: string) {
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text
    });
    if (result.embeddings && result.embeddings.length > 0) {
      return result.embeddings[0].values;
    }
    return null;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

async function findRelevantContext(queryText: string, jurisdiction: string) {
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) return "No context available due to embedding error.";

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 5,
    filter: { jurisdiction: jurisdiction }
  });

  if (error || !data || data.length === 0) {
    return `No official ${jurisdiction} statutes found in our current database. Please advise the user based on general legal principles.`;
  }

  return data.map((doc: any) => doc.content).join("\n\n---\n\n");
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { message, jurisdiction, stage, editorContent } = JSON.parse(event.body || '{}');
    
    const context = await findRelevantContext(message, jurisdiction);
      
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

    try {
      if (message.length > 2000) throw new Error("Too long for Groq, fallback to Gemini");
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        model: "mixtral-8x7b-32768",
      });
      responseText = completion.choices[0]?.message?.content || "";
    } catch (groqError) {
      try {
        const geminiResponse = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: systemPrompt + "\n\nUser: " + message,
        });
        responseText = geminiResponse.text || "";
      } catch (geminiError) {
        const hfResponse = await hf.textGeneration({
          model: "meta-llama/Llama-2-7b-chat-hf",
          inputs: systemPrompt + "\n\nUser: " + message,
        });
        responseText = hfResponse.generated_text || "I'm sorry, all AI providers are currently unavailable.";
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: responseText })
    };
  } catch (error) {
    console.error("Chat API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process chat request" })
    };
  }
};
