import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

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
      const result = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: text,
        config: {
          outputDimensionality: 768
        }
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

    if (error || !data || data.length === 0) return `No official ${jurisdiction} statutes found.`;
    return data.map((doc: any) => doc.content).join("\n\n---\n\n");
  }

  // API Routes
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, jurisdiction, stage, editorContent } = req.body;
      const context = await findRelevantContext(message, jurisdiction);
      
      const hasPremiumTag = message.toLowerCase().includes("incorporate") || message.toLowerCase().includes("tax") || message.toLowerCase().includes("memo") || message.toLowerCase().includes("guide");
      
      let stageInstructions = "";
      if (stage === 'prep') {
        stageInstructions = "Focus on IRAC frameworks and issue-spotting drills.";
      } else if (stage === 'training') {
        stageInstructions = `CRITIQUE MODE: Review: "${editorContent || 'No content yet'}".`;
      } else if (stage === 'practice') {
        stageInstructions = "Provide templates for real-world memos and contracts.";
      }

      const systemPrompt = `You are a supportive, knowledgeable legal mentor. 
      Jurisdiction: ${jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Law'}.
      Current Stage: ${stage}.
      ${stageInstructions}
      Use context: ${context}.
      ${hasPremiumTag ? "Recommend 'Premium Legal Drafting Guide' ($49.99)." : ""}`;

      let responseText = "";
      try {
        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'dummy') {
          const completion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }],
            model: "mixtral-8x7b-32768",
          });
          responseText = completion.choices[0]?.message?.content || "";
        } else throw new Error("Skipping GROQ");
      } catch {
        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: systemPrompt + "\n\nUser: " + message,
        });
        responseText = geminiRes.text || "";
      }

      res.json({ response: responseText });
    } catch (error: any) {
      res.status(500).json({ error: "Chat failed", details: error.message });
    }
  });

  app.post("/api/grade", async (req, res) => {
    try {
      const { scenario, userResponse } = req.body;
      const systemPrompt = `Grade this legal response. Scenario: ${scenario}. User: ${userResponse}`;
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: systemPrompt,
      });
      res.json({ feedback: geminiResponse.text });
    } catch (error: any) {
      res.status(500).json({ error: "Grading failed" });
    }
  });

  app.post("/api/embed", async (req, res) => {
    try {
      const { fileBase64, filename, jurisdiction, difficulty, productTag } = req.body;
      if (!fileBase64) return res.status(400).json({ error: "No file" });

      const buffer = Buffer.from(fileBase64, 'base64');
      // @ts-ignore
      const pdf = (await import("pdf-parse-debugging-disabled")).default;
      const data = await pdf(buffer);
      const text = data.text;
      const chunks = text.split('\n\n').filter((p: string) => p.trim().length > 100);

      let processedCount = 0;
      for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk);
        if (embedding) {
          const { error } = await supabase.from('documents').insert({
            content: chunk,
            embedding,
            metadata: { jurisdiction, difficulty, productTag, original_filename: filename }
          });
          if (!error) processedCount++;
        }
      }
      res.json({ message: `Processed ${processedCount} of ${chunks.length} chunks` });
    } catch (error: any) {
      res.status(500).json({ error: "Embedding failed", details: error.message });
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
