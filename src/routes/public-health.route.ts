import { Router } from "express";
import { PublicHealthController } from "../controllers/public-health.controller";

const router = Router();

router.get("/ethiopia/regions/status", PublicHealthController.getEthiopiaRegionalStatus);
router.get("/outbreak-news", PublicHealthController.getOutbreakNews);

export default router;
