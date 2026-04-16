import { Handler } from '@netlify/functions';
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
// @ts-ignore
const pdf = require("pdf-parse");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getEmbedding(text: string) {
  try {
    const model = (ai as any).getGenerativeModel({ model: "text-embedding-004"});
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fileBase64, filename, jurisdiction, difficulty, productTag } = JSON.parse(event.body || '{}');

    if (!fileBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No file provided" }) };
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    
    // Parse PDF
    const data = await pdf(buffer);
    const text = data.text;

    // Simple chunking (by paragraph)
    const chunks = text.split('\n\n').filter((p: string) => p.trim().length > 100);

    // Process chunks concurrently to avoid 10-second Netlify timeout
    const uploadPromises = chunks.map(async (chunk: string) => {
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
        if (error) console.error("Supabase Insert Error:", error);
      }
    });

    await Promise.all(uploadPromises);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Successfully processed ${chunks.length} chunks from ${filename}` })
    };
  } catch (error) {
    console.error("Embedding API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process document" })
    };
  }
};
