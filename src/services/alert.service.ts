import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { EmailSender } from "../utils/EmailSender";

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const VALID_CHANNELS = ["WEB", "SMS", "USSD", "EMAIL"] as const;

type AlertSeverityValue = (typeof VALID_SEVERITIES)[number];
type AlertChannelValue = (typeof VALID_CHANNELS)[number];

type AlertWorkflowStatus = "Draft" | "Approved";

type AlertManagementView = {
  id: string;
  disease: string | null;
  severity: string;
  channelString: string;
  advisory: string;
  status: AlertWorkflowStatus;
  targetZone: string;
  isDelivered: boolean;
};

type AlertNotificationDetails = {
  id: string;
  targetZone: string;
  severity: string;
  message: string;
  disease: { name: string } | null;
  advisory: { content: string } | null;
};

export class AlertService {
  private static toAlertManagementView(alert: {
    id: string;
    severity: string;
    channel: string;
    message: string;
    isDelivered: boolean;
    targetZone: string;
    disease: { name: string } | null;
    advisory: { content: string } | null;
  }): AlertManagementView {
    return {
      id: alert.id,
      disease: alert.disease?.name ?? null,
      severity: alert.severity,
      channelString: alert.channel,
      advisory: alert.advisory?.content ?? alert.message,
      status: alert.isDelivered ? "Approved" : "Draft",
      targetZone: alert.targetZone,
      isDelivered: alert.isDelivered,
    };
  }

  private static parseSeverity(value: unknown): AlertSeverityValue {
    if (value === undefined || value === null || value === "") {
      return "MEDIUM";
    }
    const normalized = String(value).trim().toUpperCase();
    if (!VALID_SEVERITIES.includes(normalized as AlertSeverityValue)) {
      throw new AppError(
        `severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
        400,
      );
    }
    return normalized as AlertSeverityValue;
  }

  private static parseChannel(value: unknown): AlertChannelValue {
    if (value === undefined || value === null || value === "") {
      return "WEB";
    }
    const normalized = String(value).trim().toUpperCase();
    if (!VALID_CHANNELS.includes(normalized as AlertChannelValue)) {
      throw new AppError(
        `channel must be one of: ${VALID_CHANNELS.join(", ")}`,
        400,
      );
    }
    return normalized as AlertChannelValue;
  }

  private static async triggerApprovalNotification(
    alert: AlertNotificationDetails,
  ) {
    const recipients = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { assignedDistrict: alert.targetZone },
          { region: alert.targetZone },
        ],
      },
      select: { email: true },
    });

    const emails = recipients
      .map((user) => user.email)
      .filter((email) => Boolean(email));

    const emailResult = await EmailSender.sendBulkAlertApprovalEmails(emails, {
      disease: alert.disease?.name ?? "Unknown disease",
      location: alert.targetZone,
      advisory: alert.advisory?.content ?? alert.message,
      severity: alert.severity,
    });

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
      },
    });

    logger.info("Alert approved notification triggered", {
      alertId: alert.id,
      disease: alert.disease?.name ?? null,
      severity: alert.severity,
      targetZone: alert.targetZone,
      recipientsAttempted: emailResult.attempted,
      delivered: emailResult.delivered,
      failed: emailResult.failed,
    });
  }

  static async getAllAlerts() {
    const alerts = await prisma.alert.findMany({
      include: {
        disease: true,
        advisory: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return alerts.map((alert) => this.toAlertManagementView(alert));
  }

  static async approveAlert(alertId: string) {
    if (!alertId) {
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
      data: { isDelivered: true },
      include: {
        disease: true,
        advisory: true,
      },
    });

    const managementView = this.toAlertManagementView(updatedAlert);
    await this.triggerApprovalNotification(updatedAlert);

    return managementView;
  }

  static async rejectAlert(alertId: string) {
    if (!alertId) {
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
        isDelivered: false,
        deliveryCount: 0,
        failedCount: 0,
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    return this.toAlertManagementView(updatedAlert);
  }

  static async createAlert(data: {
    targetZone?: string;
    diseaseId?: number;
    advisoryId?: string;
    createdById?: string;
    title?: string;
    message?: string;
    severity?: string;
    channel?: string;
    isDelivered?: boolean;
    userId: string;
  }) {
    const {
      targetZone,
      diseaseId,
      advisoryId,
      createdById,
      title,
      message,
      severity,
      channel,
      isDelivered,
      userId,
    } = data;

    const parsedSeverity = this.parseSeverity(severity);
    const parsedChannel = this.parseChannel(channel);

    if (!targetZone || !title || !message) {
      throw new AppError("targetZone, title and message are required", 400);
    }

    const alert = await prisma.alert.create({
      data: {
        targetZone,
        diseaseId,
        advisoryId,
        createdById: createdById ?? userId,
        title,
        message,
        severity: parsedSeverity,
        channel: parsedChannel,
        isDelivered: isDelivered ?? false,
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    return this.toAlertManagementView(alert);
  }
}
