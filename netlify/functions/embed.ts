import { Handler } from '@netlify/functions';
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// @ts-ignore
const pdf = require("pdf-parse-debugging-disabled");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
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
  } catch (error: any) {
    console.error("Embedding generation error:", error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let currentStep = "Initializing";
  let lastEmbedError = "";
  let lastDbError = "";
  try {
    currentStep = "Parsing JSON Body";
    const { fileBase64, filename, jurisdiction, difficulty, productTag } = JSON.parse(event.body || '{}');

    if (!fileBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No file provided" }) };
    }

    currentStep = "Decoding Base64 to Buffer";
    const buffer = Buffer.from(fileBase64, 'base64');
    
    currentStep = "Parsing PDF text";
    const data = await pdf(buffer);
    const text = data.text;

    currentStep = "Chunking parsed text";
    // Simple chunking (by paragraph)
    const chunks = text.split('\n\n').filter((p: string) => p.trim().length > 100);

    currentStep = "Processing chunks sequentially";

    // Process chunks sequentially to avoid Gemini API 429 rate limit bursts
    let processedCount = 0;
    let embedErrorCount = 0;
    let dbErrorCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < chunks.length; i++) {
      // Check if we approach the 10s Netlify timeout (stop at 8.0 seconds to be safe)
      if (Date.now() - startTime > 8000) {
        console.warn('Approaching Netlify timeout limit. Stopping early.');
        break;
      }

      const chunk = chunks[i];
      try {
        const embedding = await getEmbedding(chunk);
        if (embedding) {
          const { error } = await supabase.from('documents').insert({
            content: chunk,
            embedding,
            metadata: { 
              jurisdiction, 
              difficulty, 
              productTag,
              original_filename: filename 
            }
          });
          if (error) {
            console.error(`Supabase Insert Error (Dimension: ${embedding.length}):`, error);
            dbErrorCount++;
            lastDbError = `${error.message} (Vector Size: ${embedding.length})` || JSON.stringify(error);
          } else {
            processedCount++;
          }
        } else {
          embedErrorCount++;
        }
      } catch (e: any) {
        embedErrorCount++;
        lastEmbedError = e.message || String(e);
      }
    }

    let finalMessage = `Processed ${processedCount} of ${chunks.length} chunks from ${filename}${processedCount < chunks.length ? ' (Truncated due to time limit)' : ''}. Errors - Embed: ${embedErrorCount}, DB: ${dbErrorCount}`;
    
    if (embedErrorCount > 0 && lastEmbedError) {
       finalMessage += ` | Embed Error: ${lastEmbedError}`;
    }
    if (dbErrorCount > 0 && lastDbError) {
       finalMessage += ` | DB Error: ${lastDbError}`;
    }

    // If zero chunks succeeded but we had chunks, return an error status so the frontend shows it as a failure
    if (processedCount === 0 && chunks.length > 0) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: finalMessage,
          details: lastEmbedError || lastDbError
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: finalMessage,
        embedErrorDetails: lastEmbedError
      })
    };
  } catch (error: any) {
    console.error(`Embedding API Error at step [${currentStep}]:`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: `Failed to process document.`,
        step: currentStep,
        details: error.message || String(error),
        stack: error.stack
      })
    };
  }
};
