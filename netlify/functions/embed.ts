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
      model: "text-embedding-004",
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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let currentStep = "Initializing";
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

    currentStep = "Processing chunks in batches";

    // Process chunks in batches to avoid OOM socket exhaustion
    let processedCount = 0;
    let embedErrorCount = 0;
    let dbErrorCount = 0;
    const batchSize = 10;
    const startTime = Date.now();

    for (let i = 0; i < chunks.length; i += batchSize) {
      // Check if we approach the 10s Netlify timeout (stop at 7.5 seconds to be safe)
      if (Date.now() - startTime > 7500) {
        console.warn('Approaching Netlify timeout limit. Stopping early.');
        break;
      }

      const batch = chunks.slice(i, i + batchSize);
      
      const uploadPromises = batch.map(async (chunk: string) => {
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
            console.error("Supabase Insert Error:", error);
            dbErrorCount++;
          } else {
            processedCount++;
          }
        } else {
          embedErrorCount++;
        }
      });

      await Promise.all(uploadPromises);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `Successfully processed ${processedCount} of ${chunks.length} chunks from ${filename}${processedCount < chunks.length ? ' (Truncated to fit platform time limit)' : ''}. Errors - Embed: ${embedErrorCount}, DB: ${dbErrorCount}` 
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
