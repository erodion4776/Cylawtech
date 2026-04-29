import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from 'module';
import dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
let pdf: any;
try {
  const pdfModule = require("pdf-parse-debugging-disabled");
  pdf = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
} catch (e) {
  console.error("Failed to load pdf-parse module:", e);
}

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getEmbedding(text: string) {
  try {
    const model = ai.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    if (result.embedding && result.embedding.values) {
      return result.embedding.values;
    }
    return null;
  } catch (error: any) {
    console.error("Embedding generation error:", error);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-admin-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    console.error("Unauthorized attempt to access embed endpoint. Expected key present:", !!process.env.ADMIN_KEY);
    return { 
      statusCode: 403, 
      headers, 
      body: JSON.stringify({ 
        error: "Forbidden: Invalid or missing Admin Key",
        step: "Authorization",
        details: !process.env.ADMIN_KEY ? "Server-side ADMIN_KEY is not configured." : "The provided master key did not match."
      }) 
    };
  }

  let currentStep = "Initializing";
  
  if (!process.env.GEMINI_API_KEY) {
     return { 
       statusCode: 500, 
       headers, 
       body: JSON.stringify({ error: "GEMINI_API_KEY is not configured in environment variables.", step: "Config" }) 
     };
  }

  if (!pdf) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: "PDF parser failed to initialize.", step: "Config" }) 
    };
  }

  let lastEmbedError = "";
  let lastDbError = "";
  try {
    currentStep = "Parsing JSON Body";
    const body = JSON.parse(event.body || '{}');
    const { fileBase64, filename, site, context: uploadContext, jurisdiction, difficulty, productTag } = body;

    if (!fileBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No file provided" }) };
    }

    currentStep = "Decoding Base64 to Buffer";
    const buffer = Buffer.from(fileBase64, 'base64');
    
    let text = "";
    if (filename?.toLowerCase().endsWith('.pdf')) {
      currentStep = "Parsing PDF text";
      try {
        if (typeof pdf !== 'function') {
          throw new Error("PDF parser is not a function. Initialization failed.");
        }
        const data = await pdf(buffer);
        text = data.text;
        console.log(`PDF parsed successfully. Characters: ${text.length}`);
      } catch (pdfErr: any) {
        console.error("PDF Parse Error Detail:", pdfErr);
        throw new Error(`Failed to parse PDF (${filename}): ${pdfErr.message || String(pdfErr)}`);
      }
    } else {
      currentStep = "Reading text content";
      text = buffer.toString('utf-8');
    }

    if (!text || text.trim().length === 0) {
      throw new Error("Extracted text is empty. The file might be corrupted or unreadable.");
    }

    currentStep = "Chunking parsed text";
    // Improved chunking (by paragraphs with length filtering)
    const chunks = text.split(/\n\s*\n/).map(p => p.trim()).filter((p: string) => p.length > 50);
    
    if (chunks.length === 0 && text.length > 0) {
      // Fallback for files without double newlines
      chunks.push(text.substring(0, 5000));
    }

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
            site: site || 'global',
            context: uploadContext || jurisdiction || 'general',
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
            let errorMsg = error.message;
            if (error.code === '42P01') errorMsg = "Table 'documents' does not exist in Supabase.";
            if (error.code === '23505') errorMsg = "Duplicate content detected.";
            if (error.code === '42703') errorMsg = "Missing column in Supabase (check if 'embedding' column exists).";
            
            lastDbError = `${errorMsg} (HINT: ${error.hint || 'None'}) (Code: ${error.code})` || JSON.stringify(error);
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
        headers,
        body: JSON.stringify({ 
          error: "Indexing failed completely",
          details: finalMessage,
          step: "Processing Loop",
          lastEmbedError,
          lastDbError
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: finalMessage,
        embedErrorDetails: lastEmbedError
      })
    };
  } catch (error: any) {
    console.error(`Embedding API Error at step [${currentStep}]:`, error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: `Failed to process document.`,
        step: currentStep,
        details: error.message || String(error),
        stack: error.stack
      })
    };
  }
};
