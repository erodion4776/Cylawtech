import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cors from "cors";
import chatRoutes from "./src/server/routes/chatRoutes.ts";
import adminRoutes from "./src/server/routes/adminRoutes.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Logging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/.netlify/functions')) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });

  // Reusable clients for existing handlers
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://dummy.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy'
  );

  // Modular Routes
  app.use("/api", chatRoutes);
  app.use("/api/admin", adminRoutes);
  
  // Backward compatibility for existing UI
  // Note: the new modular /chat requires an API key. 
  // If the internal UI doesn't send it, we might need a bypass or shared logic.
  
  const handleEmbed = async (req: express.Request, res: express.Response) => {
    try {
      const { fileBase64, filename, jurisdiction, difficulty, productTag, site, context } = req.body;
      if (!fileBase64) return res.status(400).json({ error: "No file" });

      const buffer = Buffer.from(fileBase64, 'base64');
      // @ts-ignore
      const pdf = (await import("pdf-parse-debugging-disabled")).default;
      const data = await pdf(buffer);
      const text = data.text;
      const chunks = text.split('\n\n').filter((p: string) => p.trim().length > 100);

      const model = "text-embedding-004";

      let processedCount = 0;
      for (const chunk of chunks) {
        const result = await ai.models.embedContent({ model, contents: chunk });
        const embedding = result.embeddings && result.embeddings.length > 0 ? result.embeddings[0].values : null;

        if (embedding) {
          const { error } = await supabase.from('documents').insert({
            content: chunk,
            embedding,
            site: site || 'global',
            context: context || 'general',
            metadata: { jurisdiction, difficulty, productTag, original_filename: filename, site, context }
          });
          if (!error) processedCount++;
        }
      }
      res.json({ message: `Processed ${processedCount} of ${chunks.length} chunks` });
    } catch (error: any) {
      res.status(500).json({ error: "Embedding failed", details: error.message });
    }
  };

  const handleGrade = async (req: express.Request, res: express.Response) => {
    try {
      const { scenario, userResponse } = req.body;
      const systemPrompt = `Grade this legal response. Scenario: ${scenario}. User: ${userResponse}`;
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: systemPrompt
      });
      res.json({ feedback: geminiResponse.text });
    } catch (error: any) {
      res.status(500).json({ error: "Grading failed" });
    }
  };

  // Internal Legacy Routes
  app.post("/.netlify/functions/embed", handleEmbed);
  app.post("/api/embed", handleEmbed);
  app.post("/.netlify/functions/grade", handleGrade);
  app.post("/api/grade", handleGrade);

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
    console.log(`API Key security enabled via process.env.API_KEYS`);
  });
}

startServer();

