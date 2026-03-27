import { Router } from "express";
import { RegionController } from "../controllers/region.controller";

const router = Router();

router.get("/", RegionController.getAllRegions);

export default router;
