import { prisma } from "../lib/prisma";
import { AdvisoryStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";
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
  aiSuggested: boolean;
  sourceReportId: string | null;
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
    aiSuggested: boolean;
    sourceReportId: string | null;
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
      aiSuggested: alert.aiSuggested,
      sourceReportId: alert.sourceReportId,
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

  static async getAllAlerts(filters?: { aiSuggested?: boolean }) {
    const where =
      typeof filters?.aiSuggested === "boolean"
        ? { aiSuggested: filters.aiSuggested }
        : undefined;

    const alerts = await prisma.alert.findMany({
      where,
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
        advisory: { select: { id: true, status: true, content: true } },
      },
    });

    if (!existingAlert) {
      throw new AppError("Alert not found", 404);
    }

    // BR-02: block broadcast if the linked advisory is not yet APPROVED
    if (
      existingAlert.advisory &&
      existingAlert.advisory.status !== AdvisoryStatus.APPROVED
    ) {
      throw new AppError(
        "Cannot approve alert: linked advisory must be APPROVED before broadcast",
        422,
      );
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
    sourceReportId?: string;
    createdById?: string;
    title?: string;
    message?: string;
    severity?: string;
    channel?: string;
    isDelivered?: boolean;
    aiSuggested?: boolean;
    userId: string;
  }) {
    const {
      targetZone,
      diseaseId,
      advisoryId,
      sourceReportId,
      createdById,
      title,
      message,
      severity,
      channel,
      isDelivered,
      aiSuggested,
      userId,
    } = data;

    const parsedSeverity = this.parseSeverity(severity);
    const parsedChannel = this.parseChannel(channel);

    if (!targetZone || !title || !message) {
      throw new AppError("targetZone, title and message are required", 400);
    }

    // BR-02: if an advisory is linked, it must be APPROVED before the alert can be created
    if (advisoryId) {
      const linkedAdvisory = await prisma.advisory.findUnique({
        where: { id: advisoryId },
        select: { status: true },
      });
      if (!linkedAdvisory) {
        throw new AppError("Linked advisory not found", 404);
      }
      if (linkedAdvisory.status !== AdvisoryStatus.APPROVED) {
        throw new AppError(
          "Cannot create alert: linked advisory must be APPROVED first",
          422,
        );
      }
    }

    const alert = await prisma.alert.create({
      data: {
        targetZone,
        diseaseId,
        advisoryId,
        sourceReportId,
        aiSuggested: aiSuggested ?? false,
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

  /**
   * BR-03: Called by Estif's report.service.ts after a new report is persisted.
   * Checks if deaths/cases in the last 24h for the given district+diseaseType
   * exceed the 10% mortality threshold. If so, creates a CRITICAL alert and
   * notifies all ADMIN users.
   */
  static async checkAndCreateCriticalMortalityAlert(
    diseaseType: string,
    district: string,
  ): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const reports = await prisma.diseaseReport.findMany({
      where: {
        diseaseType,
        district,
        timestamp: { gte: since },
      },
      select: { caseCount: true, deathCount: true },
    });

    if (reports.length === 0) return;

    const totalCases = reports.reduce((sum, r) => sum + r.caseCount, 0);
    const totalDeaths = reports.reduce((sum, r) => sum + r.deathCount, 0);

    if (totalCases === 0) return;

    const mortalityRate = totalDeaths / totalCases;
    if (mortalityRate <= 0.1) return;

    const title = `CRITICAL: ${diseaseType} mortality rate exceeded 10% in ${district}`;
    const message =
      `In the last 24 hours, ${district} reported ${totalDeaths} deaths out of ` +
      `${totalCases} ${diseaseType} cases (${(mortalityRate * 100).toFixed(1)}% mortality rate). ` +
      `Immediate response required.`;

    const alert = await prisma.alert.create({
      data: {
        targetZone: district,
        title,
        message,
        severity: "CRITICAL",
        channel: "EMAIL",
        isDelivered: false,
      },
    });

    logger.warn("BR-03 critical mortality threshold exceeded", {
      alertId: alert.id,
      diseaseType,
      district,
      totalCases,
      totalDeaths,
      mortalityRate: `${(mortalityRate * 100).toFixed(1)}%`,
    });

    const adminEmails = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { email: true },
    });

    const emails = adminEmails.map((u) => u.email).filter(Boolean);

    const emailResult = await EmailSender.sendBulkAlertApprovalEmails(emails, {
      disease: diseaseType,
      location: district,
      advisory: message,
      severity: "CRITICAL",
    });

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
      },
    });
  }
}
