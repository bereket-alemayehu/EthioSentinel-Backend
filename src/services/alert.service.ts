import { prisma } from "../lib/prisma";
import { AlertChannel, AlertSeverity } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

type AlertWorkflowStatus = "Draft" | "Approved";

type AlertManagementView = {
  id: number;
  disease: string | null;
  severity: AlertSeverity;
  advisory: string;
  status: AlertWorkflowStatus;
};

export class AlertService {
  private static toAlertManagementView(alert: {
    id: number;
    severity: AlertSeverity;
    message: string;
    sentAt: Date | null;
    disease: { name: string } | null;
    advisory: { content: string } | null;
  }): AlertManagementView {
    return {
      id: alert.id,
      disease: alert.disease?.name ?? null,
      severity: alert.severity,
      advisory: alert.advisory?.content ?? alert.message,
      status: alert.sentAt ? "Approved" : "Draft",
    };
  }

  private static async triggerApprovalNotification(alert: AlertManagementView) {
    logger.info("Alert approved notification triggered", {
      alertId: alert.id,
      disease: alert.disease,
      severity: alert.severity,
      status: alert.status,
    });
  }

  static async getAllAlerts() {
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

    return alerts.map((alert) => this.toAlertManagementView(alert));
  }

  static async approveAlert(alertId: number) {
    if (Number.isNaN(alertId)) {
      throw new AppError("Invalid alert id", 400);
    }

    const existingAlert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        disease: true,
        advisory: true,
      },
    });

    if (!existingAlert) {
      throw new AppError("Alert not found", 404);
    }

    const updatedAlert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        sentAt: new Date(),
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    const managementView = this.toAlertManagementView(updatedAlert);
    await this.triggerApprovalNotification(managementView);

    return managementView;
  }

  static async rejectAlert(alertId: number) {
    if (Number.isNaN(alertId)) {
      throw new AppError("Invalid alert id", 400);
    }

    const existingAlert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        disease: true,
        advisory: true,
      },
    });

    if (!existingAlert) {
      throw new AppError("Alert not found", 404);
    }

    const updatedAlert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        sentAt: null,
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    return this.toAlertManagementView(updatedAlert);
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
