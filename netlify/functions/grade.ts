import { Handler } from '@netlify/functions';
import { GoogleGenerativeAI } from "@google/generative-ai";

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy');

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { scenario, userResponse } = JSON.parse(event.body || '{}');
    
    const systemPrompt = `You are an expert legal evaluator. Grade the following user response to the given scenario based on professional legal standards. Highlight strengths and areas for improvement.
    Scenario: ${scenario}
    User Response: ${userResponse}`;

    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(systemPrompt);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ feedback: result.response.text() })
    };
  } catch (error) {
    console.error("Grading API Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to grade response" })
    };
  }
};
