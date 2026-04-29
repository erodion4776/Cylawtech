import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "dummy" });

export const generateAIResponse = async (prompt: string, contextDocs: string, modelOverride?: string): Promise<string> => {
  const provider = modelOverride?.includes('groq') ? 'groq' : (process.env.LLM_PROVIDER || "gemini");
  const modelName = modelOverride || (provider === "groq" ? "mixtral-8x7b-32768" : "gemini-1.5-flash");
  
  const systemPrompt = `You are LexAI, a high-level legal assistant. Use the following context to answer the query accurately. 
  
  ROLE:
  - Respond as a qualified legal intelligence assistant.
  - Maintain a formal, precise, and authoritative tone, but be polite and conversational for general greetings.

  CONVERSATION & GREETINGS:
  - If the user is just saying hello, greeting you, or asking a general non-legal question, respond politely and ask how you can assist them with legal matters today. You do not need to restrict yourself to the context for simple greetings.
  
  CONTEXT:
  ${contextDocs}
  
  If the context doesn't contain the answer to a legal question, state that you don't know based on the provided data, but can offer general guidance.`;

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
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: systemPrompt + "\n\nQuery: " + prompt
      });
      return result.text || "";
    }
  } catch (error) {
    console.error("AI Generation error:", error);
    throw new Error("Failed to generate AI response");
  }
};

