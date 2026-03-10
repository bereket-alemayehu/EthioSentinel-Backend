import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.get(
  "/users",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.RESEARCHER),
  async (_req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          regionId: true,
          districtId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(users);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },
);
