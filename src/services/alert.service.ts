import { prisma } from "../lib/prisma";
import { AlertChannel, AlertSeverity } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { EmailSender } from "../utils/EmailSender";

type AlertWorkflowStatus = "Draft" | "Approved";

type AlertManagementView = {
  id: number;
  idString: string;
  disease: string | null;
  severity: AlertSeverity;
  severityString: string;
  channelString: string;
  advisory: string;
  status: AlertWorkflowStatus;
  targetZone: string;
  isDelivered: boolean;
};

type AlertNotificationDetails = {
  id: number;
  regionId: number;
  districtId: number | null;
  severity: AlertSeverity;
  message: string;
  disease: { name: string } | null;
  advisory: { content: string } | null;
  region: { name: string };
  district: { name: string } | null;
};

export class AlertService {
  private static toAlertManagementView(alert: {
    id: number;
    severity: AlertSeverity;
    channel: AlertChannel;
    message: string;
    sentAt: Date | null;
    disease: { name: string } | null;
    advisory: { content: string } | null;
    region: { name: string } | null;
    district: { name: string } | null;
  }): AlertManagementView {
    const targetZone = alert.district?.name ?? alert.region?.name ?? "Unknown";
    return {
      id: alert.id,
      idString: String(alert.id),
      disease: alert.disease?.name ?? null,
      severity: alert.severity,
      severityString: alert.severity,
      channelString: alert.channel,
      advisory: alert.advisory?.content ?? alert.message,
      status: alert.sentAt ? "Approved" : "Draft",
      targetZone,
      isDelivered: Boolean(alert.sentAt),
    };
  }

  private static parseEnumValue<T extends string>(
    value: unknown,
    enumObject: Record<string, T>,
    field: string,
  ): T | undefined {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const normalized = String(value).trim().toUpperCase();
    const allowedValues = Object.values(enumObject);
    if (!allowedValues.includes(normalized as T)) {
      throw new AppError(`${field} must be one of: ${allowedValues.join(", ")}`, 400);
    }
    return normalized as T;
  }

  private static async triggerApprovalNotification(
    alert: AlertNotificationDetails,
  ) {
    const location = alert.district
      ? `${alert.district.name}, ${alert.region.name}`
      : alert.region.name;

    const recipients = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(alert.districtId
          ? { districtId: alert.districtId }
          : { regionId: alert.regionId }),
      },
      select: {
        email: true,
      },
    });

    const emails = recipients
      .map((user) => user.email)
      .filter((email) => Boolean(email));

    const emailResult = await EmailSender.sendBulkAlertApprovalEmails(emails, {
      disease: alert.disease?.name ?? "Unknown disease",
      location,
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
      location,
      recipientsAttempted: emailResult.attempted,
      delivered: emailResult.delivered,
      failed: emailResult.failed,
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
        region: true,
        district: true,
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
        region: true,
        district: true,
        disease: true,
        advisory: true,
      },
    });

    const managementView = this.toAlertManagementView(updatedAlert);
    await this.triggerApprovalNotification(updatedAlert);

    return managementView;
  }

  static async rejectAlert(alertId: number) {
    if (Number.isNaN(alertId)) {
      throw new AppError("Invalid alert id", 400);
    }

    const existingAlert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        region: true,
        district: true,
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
        deliveryCount: 0,
        failedCount: 0,
      },
      include: {
        region: true,
        district: true,
        disease: true,
        advisory: true,
      },
    });

    return this.toAlertManagementView(updatedAlert);
  }

  static async createAlert(data: {
    regionId?: number;
    districtId?: number;
    targetZone?: string;
    diseaseId?: number;
    advisoryId?: number;
    createdById?: number;
    title?: string;
    message?: string;
    severity?: AlertSeverity | string;
    channel?: AlertChannel | string;
    isDelivered?: boolean;
    sentAt?: string;
    userId: number;
  }) {
    const {
      regionId,
      districtId,
      targetZone,
      diseaseId,
      advisoryId,
      createdById,
      title,
      message,
      severity,
      channel,
      isDelivered,
      sentAt,
      userId,
    } = data;

    let resolvedRegionId = regionId;
    let resolvedDistrictId = districtId;
    if (!resolvedRegionId && targetZone) {
      const trimmedTargetZone = targetZone.trim();
      if (trimmedTargetZone) {
        const district = await prisma.district.findFirst({
          where: { name: { equals: trimmedTargetZone, mode: "insensitive" } },
          select: { id: true, regionId: true },
        });
        if (district) {
          resolvedDistrictId = district.id;
          resolvedRegionId = district.regionId;
        } else {
          const region = await prisma.region.findFirst({
            where: { name: { equals: trimmedTargetZone, mode: "insensitive" } },
            select: { id: true },
          });
          resolvedRegionId = region?.id;
        }
      }
    }

    const parsedSeverity =
      this.parseEnumValue(severity, AlertSeverity, "severity") ??
      AlertSeverity.MEDIUM;
    const parsedChannel =
      this.parseEnumValue(channel, AlertChannel, "channel") ?? AlertChannel.WEB;

    if (!resolvedRegionId || !title || !message) {
      throw new AppError("regionId or targetZone, title and message are required", 400);
    }

    const alert = await prisma.alert.create({
      data: {
        regionId: resolvedRegionId,
        districtId: resolvedDistrictId,
        diseaseId,
        advisoryId,
        createdById: createdById ?? userId,
        title,
        message,
        severity: parsedSeverity,
        channel: parsedChannel,
        sentAt: isDelivered ? new Date() : sentAt ? new Date(sentAt) : undefined,
      },
      include: {
        region: true,
        district: true,
        disease: true,
        advisory: true,
      },
    });

    return this.toAlertManagementView(alert);
  }
}
