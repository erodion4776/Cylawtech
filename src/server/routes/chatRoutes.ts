import { Router } from "express";
import { handleChat } from "../controllers/chatController.ts";
import { validateApiKey } from "../middleware/auth.ts";

const router = Router();

// The chat controller now handles its own dynamic database-driven validation
router.post("/chat", handleChat);

export default router;
