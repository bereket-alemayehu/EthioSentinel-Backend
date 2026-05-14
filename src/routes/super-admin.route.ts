import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { Role } from "@prisma/client";
import { SuperAdminController } from "../controllers/superAdmin.controller";

const router = Router();

router.use(authenticate, authorize(Role.SUPER_ADMIN));

router.get("/overview", SuperAdminController.getOverview);
router.get("/users", SuperAdminController.listUsers);
router.post("/users", SuperAdminController.createUser);
router.get("/audit-logs", SuperAdminController.listAuditLogs);
router.patch("/users/:id", SuperAdminController.updateUser);
router.delete("/users/:id", SuperAdminController.revokeUser);
router.post("/users/:id/reset-password", SuperAdminController.resetPassword);

export default router;
