import { Request, Response } from "express";
import { getRelevantDocs } from "../services/ragService.ts";
import { generateAIResponse } from "../services/aiService.ts";
import { supabase } from "../config/supabase.ts";

export const handleChat = async (req: Request, res: Response) => {
  const { message, context, site } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!site) {
    return res.status(400).json({ error: "Site identifier is required" });
  }

  if (!apiKey) {
    return res.status(401).json({ error: "API Key required" });
  }

  try {
    // 0. Check global settings and API key validity
    const [settingsRes, keyRes] = await Promise.all([
      supabase.from('settings').select('*').single(),
      supabase.from('api_keys').select('*').eq('key', apiKey as string).eq('site', site).eq('status', 'active').single()
    ]);

    if (settingsRes.error || !settingsRes.data?.api_enabled) {
      return res.status(503).json({ error: "API is currently disabled by administrator" });
    }

    if (keyRes.error || !keyRes.data) {
      return res.status(403).json({ error: "Invalid or revoked API key for this site" });
    }

    // 1. Get relevant documents (RAG)
    const relevantDocs = await getRelevantDocs(message, context || "general", site);

    // 2. Generate AI reply
    // Use the model configured in settings if provided
    const activeModel = settingsRes.data.active_model;
    const reply = await generateAIResponse(message, relevantDocs, activeModel);

    res.json({ reply });
  } catch (error: any) {
    console.error("Chat controller error:", error);
    res.status(500).json({ error: "Failed to process chat", details: error.message });
  }
};
