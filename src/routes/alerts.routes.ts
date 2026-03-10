import {
  AlertChannel,
  AlertSeverity,
  UserRole,
} from "../../generated/prisma/enums";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";

export const alertsRouter = Router();

alertsRouter.get("/alerts", async (_req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        region: true,
        district: true,
        disease: true,
        advisory: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

alertsRouter.post(
  "/alerts",
  authenticate,
  authorize(UserRole.ADMIN),
  async (req, res) => {
    try {
      const {
        regionId,
        districtId,
        diseaseId,
        advisoryId,
        createdById,
        title,
        message,
        severity,
        channel,
        sentAt,
      } = req.body as {
        regionId?: number;
        districtId?: number;
        diseaseId?: number;
        advisoryId?: number;
        createdById?: number;
        title?: string;
        message?: string;
        severity?: AlertSeverity;
        channel?: AlertChannel;
        sentAt?: string;
      };

      if (!regionId || !title || !message) {
        return res.status(400).json({
          error: "regionId, title and message are required",
        });
      }

      const alert = await prisma.alert.create({
        data: {
          regionId,
          districtId,
          diseaseId,
          advisoryId,
          createdById: createdById ?? req.user!.id,
          title,
          message,
          severity: severity ?? AlertSeverity.MEDIUM,
          channel: channel ?? AlertChannel.WEB,
          sentAt: sentAt ? new Date(sentAt) : undefined,
        },
      });

      return res.status(201).json(alert);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },
);
