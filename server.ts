import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AI Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });
const hf = new HfInference(process.env.HF_TOKEN || 'dummy');

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';
const supabase = createClient(supabaseUrl, supabaseKey);

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
      const { message } = req.body;
      
      // 1. Vector Search (Mocked for now since we don't have the actual DB schema)
      // In a real scenario:
      // const embedding = await createEmbedding(message);
      // const { data: documents } = await supabase.rpc('match_documents', { query_embedding: embedding, match_threshold: 0.78, match_count: 5 });
      
      const mockContext = "Legal context retrieved from Supabase Vector Store.";
      const hasPremiumTag = message.toLowerCase().includes("incorporate") || message.toLowerCase().includes("tax");
      
      const systemPrompt = `You are LexAI, a helpful legal assistant. Use the following context to answer the user's question: ${mockContext}.
      ${hasPremiumTag ? "The user's query relates to a premium topic. At the end of your response, naturally recommend our 'Premium Tech Startup Incorporation Guide' available in the Resource Library for $49.99." : ""}`;

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
