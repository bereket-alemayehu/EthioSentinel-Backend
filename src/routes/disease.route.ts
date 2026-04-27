import { Router } from "express";
import { DiseaseController } from "../controllers/disease.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get("/", DiseaseController.getAllDiseases);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  DiseaseController.createDisease
);

export default router;
