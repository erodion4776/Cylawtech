import { Request, Response, NextFunction } from "express";

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const validKeys = (process.env.API_KEYS || "").split(",").map(k => k.trim()).filter(k => k.length > 0);

  // If no keys defined, we might want to warn or default to a development key
  if (validKeys.length === 0) {
    console.warn("No API_KEYS defined in environment. Security is compromised.");
    return next(); // Default allow for development if no keys are set, or rethink logic
  }

  if (!apiKey || !validKeys.includes(apiKey as string)) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }

  next();
};
