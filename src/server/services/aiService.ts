import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy" });

export const generateAIResponse = async (prompt: string, contextDocs: string, modelOverride?: string): Promise<string> => {
  const provider = modelOverride?.includes('groq') ? 'groq' : (process.env.LLM_PROVIDER || "gemini");
  const modelName = modelOverride || (provider === "groq" ? "mixtral-8x7b-32768" : "gemini-3-flash-preview");
  
  const systemPrompt = `You are LexAI, a high-level legal intelligence assistant.
  
  ROLE:
  - Respond as a qualified legal intelligence assistant.
  - Maintain a formal, precise, and authoritative tone.

  CONVERSATION:
  - If the user greets you, respond politely and explain how you can help them with legal research using your memory.
  
  CONTEXT (Your specialized knowledge base):
  ${contextDocs}
  
  IMPORTANT:
  - Prioritize the CONTEXT provided above for your answers.
  - If the context doesn't contain the answer to a legal question, state that you don't know based on current data, but offer general legal principles or guidance.
  - Keep responses structured and professional.`;

  try {
    if (provider === "groq" && process.env.GROQ_API_KEY) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        model: modelName,
      });
      return completion.choices[0]?.message?.content || "";
    } else {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: "Query: " + prompt }
      ]);
      return result.response.text();
    }
  } catch (error) {
    console.error("AI Generation error:", error);
    throw new Error("Failed to generate AI response");
  }
};

