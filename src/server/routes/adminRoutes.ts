import { Router, Request, Response, NextFunction } from "express";
import * as adminController from "../controllers/adminController.ts";

const router = Router();

// Middleware to check for Admin Key
const validateAdminKey = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    console.warn("ADMIN_KEY not set in environment!");
    return res.status(500).json({ error: "Server misconfiguration: No admin key set" });
  }

  if (adminKey !== expectedKey) {
    return res.status(403).json({ error: "Forbidden: Invalid Admin Key" });
  }
  next();
};

router.use(validateAdminKey);

router.get("/settings", adminController.getSettings);
router.patch("/settings", adminController.updateSettings);

router.get("/keys", adminController.getApiKeys);
router.post("/keys", adminController.createApiKey);
router.delete("/keys/:id", adminController.revokeApiKey);

router.get("/documents", adminController.getDocs);
router.delete("/documents/:id", adminController.deleteDoc);

export default router;
