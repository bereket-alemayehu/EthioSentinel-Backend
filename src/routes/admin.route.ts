import { Router } from "express";
import { UserController } from "../controllers/user.controller";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";

const router = Router();

router.get(
  "/users",
  authenticate,
  authorize(Role.ADMIN, Role.SUPER_ADMIN),
  UserController.getAllUsers,
);

export default router;
