import { Router } from "express";
import { handleChat } from "../controllers/chatController.ts";
import { validateApiKey } from "../middleware/auth.ts";

const router = Router();

// Secure the chat endpoint with API Key validation
router.post("/chat", validateApiKey, handleChat);

export default router;
