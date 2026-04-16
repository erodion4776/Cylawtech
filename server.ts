import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import multer from "multer";
// @ts-ignore
import pdf from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
const hf = new HfInference(process.env.HF_TOKEN || 'dummy');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

// Utility: Generate Embeddings using Gemini
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

// Utility: Find relevant context from Supabase
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
    console.log("No relevant documents found in Supabase:", error);
    return `No official ${jurisdiction} statutes found in our current database. Please advise the user based on general legal principles.`;
  }

  return data.map((doc: any) => doc.content).join("\n\n---\n\n");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // LexAI Chat Endpoint (Practice Mode - RAG)
  app.post("/api/lexai/chat", async (req, res) => {
    try {
      const { message, jurisdiction, stage, editorContent } = req.body;
      
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

      // Multi-API Fallback Logic
      try {
        // Try Groq first for speed
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
        console.log("Groq failed or skipped, falling back to Gemini:", groqError);
        try {
          // Fallback to Gemini for long docs
          const geminiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: systemPrompt + "\n\nUser: " + message,
          });
          responseText = geminiResponse.text || "";
        } catch (geminiError) {
          console.log("Gemini failed, falling back to HuggingFace:", geminiError);
          // Fallback to HuggingFace
          const hfResponse = await hf.textGeneration({
            model: "meta-llama/Llama-2-7b-chat-hf",
            inputs: systemPrompt + "\n\nUser: " + message,
          });
          responseText = hfResponse.generated_text || "I'm sorry, all AI providers are currently unavailable.";
        }
      }

      res.json({ response: responseText });
    } catch (error) {
      console.error("Chat API Error:", error);
      res.status(500).json({ error: "Failed to process chat request" });
    }
  });

  // LexAI Grading Endpoint (Training Mode)
  app.post("/api/lexai/grade", async (req, res) => {
    try {
      const { scenario, userResponse } = req.body;
      
      const systemPrompt = `You are an expert legal evaluator. Grade the following user response to the given scenario based on professional legal standards. Highlight strengths and areas for improvement.
      Scenario: ${scenario}
      User Response: ${userResponse}`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: systemPrompt,
      });

      res.json({ feedback: geminiResponse.text });
    } catch (error) {
      console.error("Grading API Error:", error);
      res.status(500).json({ error: "Failed to grade response" });
    }
  });

  app.post("/api/admin/embed", upload.single("file"), async (req: any, res) => {
    try {
      const { jurisdiction, difficulty, productTag } = req.body;
      const file = req.file;

      if (!file) return res.status(400).json({ error: "No file provided" });

      const data = await pdf(file.buffer);
      const text = data.text;

      // Simple chunking (by paragraph)
      const chunks = text.split('\n\n').filter(p => p.trim().length > 100);

      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        if (embedding) {
          const { error } = await supabase.from('documents').insert({
            content: chunk,
            embedding,
            metadata: { 
              jurisdiction, 
              difficulty, 
              productTag,
              original_filename: file.originalname 
            }
          });
          if (error) console.error("Supabase Insert Error:", error);
        }
      }

      res.json({ message: `Successfully processed ${chunks.length} chunks from ${file.originalname}` });
    } catch (error) {
      console.error("Embedding API Error:", error);
      res.status(500).json({ error: "Failed to process document" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
