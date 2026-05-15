import { GoogleGenAI } from "@google/genai";
import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const hf = new HfInference(process.env.HF_TOKEN || "");

export const getEmbedding = async (text: string): Promise<number[] | null> => {
  try {
    // Prefer Gemini for embedding if key is available
    if (process.env.GEMINI_API_KEY) {
      const result = await genAI.models.embedContent({
        model: "text-embedding-004",
        contents: [text]
      });
      return result.embeddings && result.embeddings.length > 0 ? result.embeddings[0].values : null;
    } 
    
    // Fallback to Hugging Face
    if (process.env.HF_TOKEN) {
      const output = await hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        inputs: text,
      });
      return Array.isArray(output) ? (output as number[]) : null;
    }

    throw new Error("No embedding provider configured");
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
};
