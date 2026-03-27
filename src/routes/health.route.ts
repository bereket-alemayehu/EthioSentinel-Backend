import { Router } from "express";
import { HealthController } from "../controllers/health.controller";

const router = Router();

router.get("/", HealthController.checkHealth);

export default router;
