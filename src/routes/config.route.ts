import { Router } from "express";
import { ConfigController } from "../controllers/config.controller";

const router = Router();

router.get("/public", ConfigController.getPublic);

export default router;
