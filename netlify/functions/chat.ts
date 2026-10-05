import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-user-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: "Chat endpoint active. Requests are forwarded to Supabase Edge Functions.",
      status: "operational"
    })
  };
};
