import { prisma } from "../lib/prisma";
import { AlertChannel, AlertSeverity } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export class AlertService {
  static async getAllAlerts() {
    return prisma.alert.findMany({
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
  }

  static async createAlert(data: {
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
    userId: number;
  }) {
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
      userId,
    } = data;

    if (!regionId || !title || !message) {
      throw new AppError("regionId, title and message are required", 400);
    }

    return prisma.alert.create({
      data: {
        regionId,
        districtId,
        diseaseId,
        advisoryId,
        createdById: createdById ?? userId,
        title,
        message,
        severity: severity ?? AlertSeverity.MEDIUM,
        channel: channel ?? AlertChannel.WEB,
        sentAt: sentAt ? new Date(sentAt) : undefined,
      },
    });
  }
}
