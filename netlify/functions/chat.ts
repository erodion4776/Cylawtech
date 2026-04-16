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

async function getEmbedding(text: string) {
  try {
    console.log(`Generating embedding for text: ${text.substring(0, 50)}...`);
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
      config: {
        outputDimensionality: 768
      }
    });
    if (result.embeddings && result.embeddings.length > 0) {
      console.log("Embedding generated successfully.");
      return result.embeddings[0].values;
    }
    console.error("No embeddings found in result.");
    return null;
  } catch (error) {
    console.error("Embedding generation error in chat.ts:", error);
    return null;
  }
}

async function findRelevantContext(queryText: string, jurisdiction: string) {
  console.log(`Finding context for jurisdiction: ${jurisdiction}`);
  const queryEmbedding = await getEmbedding(queryText);
  if (!queryEmbedding) {
     console.error("Failed to get query embedding.");
     return "No context available due to embedding error.";
  }

  console.log("Searching Supabase for relevant documents...");
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 5,
    filter: { jurisdiction: jurisdiction }
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    return `Error searching database: ${error.message}`;
  }

  if (!data || data.length === 0) {
    console.log("No relevant documents found.");
    return `No official ${jurisdiction} statutes found in our current database. Please advise the user based on general legal principles.`;
  }

  console.log(`Found ${data.length} relevant context chunks.`);
  return data.map((doc: any) => doc.content).join("\n\n---\n\n");
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { message, jurisdiction, stage, editorContent } = JSON.parse(event.body || '{}');
    
    const context = await findRelevantContext(message, jurisdiction);
    console.log(`Context search complete. Found context: ${context.length > 0}`);
      
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

    // Fallback chain: Groq -> Gemini -> HuggingFace
    try {
      if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'dummy') {
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          model: "mixtral-8x7b-32768",
        });
        responseText = completion.choices[0]?.message?.content || "";
      } else {
        throw new Error("GROQ_API_KEY not set");
      }
    } catch (groqError) {
      console.log("GROQ failed or skipped, trying Gemini...");
      try {
        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: systemPrompt + "\n\nUser: " + message,
        });
        responseText = geminiRes.text || "";
      } catch (geminiError: any) {
        console.error("Gemini failed:", geminiError);
        try {
          if (process.env.HF_TOKEN && process.env.HF_TOKEN !== 'dummy') {
            const hfResponse = await hf.textGeneration({
              model: "meta-llama/Llama-2-7b-chat-hf",
              inputs: systemPrompt + "\n\nUser: " + message,
            });
            responseText = hfResponse.generated_text || "";
          } else {
             throw new Error("HF_TOKEN not set");
          }
        } catch (hfError) {
          console.error("HuggingFace failed:", hfError);
          responseText = "";
        }
      }
    }

    if (!responseText) {
       throw new Error("We are currently experiencing high traffic. Please try again in a few moments.");
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: responseText })
    };
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Failed to process chat request", 
        details: error.message || String(error)
      })
    };
  }
};
