import { Handler } from '@netlify/functions';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy' });

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { scenario, userResponse } = JSON.parse(event.body || '{}');
    
    const systemPrompt = `You are an expert legal evaluator. Grade the following user response to the given scenario based on professional legal standards. Highlight strengths and areas for improvement.
    Scenario: ${scenario}
    User Response: ${userResponse}`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: systemPrompt,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: geminiResponse.text })
    };
  } catch (error) {
    console.error("Grading API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to grade response" })
    };
  }
};
