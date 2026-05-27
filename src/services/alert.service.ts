import { prisma } from "../lib/prisma";
import { AdvisoryStatus } from "@prisma/client";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";
import { EmailSender } from "../utils/EmailSender";
import { env } from "../config/env.config";
import { AuditService } from "./audit.service";
import {
  buildCitizenSmsAlert,
  enrichCitizenAdvisoryContent,
  resolveDiseaseDisplayName,
  sanitizePublicHealthText,
} from "../utils/healthMessaging";
import { SmsSender } from "../utils/SmsSender";

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const VALID_CHANNELS = ["WEB", "SMS", "USSD", "EMAIL"] as const;

type AlertSeverityValue = (typeof VALID_SEVERITIES)[number];
type AlertChannelValue = (typeof VALID_CHANNELS)[number];

type AlertWorkflowStatus = "Pending" | "Active" | "Rejected";

type AlertManagementView = {
  id: string;
  title: string;
  message: string;
  disease: string | null;
  severity: string;
  channel: string;
  advisory: string;
  advisoryId: string | null;
  advisoryTitle: string | null;
  status: AlertWorkflowStatus;
  targetZone: string;
  isDelivered: boolean;
  aiSuggested: boolean;
  sourceReportId: string | null;
  createdAt: string;
};

type AlertNotificationDetails = {
  id: string;
  targetZone: string;
  severity: string;
  message: string;
  title?: string;
  disease: { name: string } | null;
  advisory: { content: string; diseaseType?: string; title?: string } | null;
};

export class AlertService {
  private static toAlertManagementView(alert: {
    id: string;
    title: string;
    severity: string;
    channel: string;
    message: string;
    isDelivered: boolean;
    deliveryCount: number;
    failedCount: number;
    targetZone: string;
    aiSuggested: boolean;
    advisoryId: string | null;
    sourceReportId: string | null;
    createdAt: Date;
    disease: { name: string } | null;
    advisory: {
      id: string;
      title: string;
      content: string;
      diseaseType?: string;
    } | null;
  }): AlertManagementView {
    const diseaseLabel = resolveDiseaseDisplayName({
      diseaseName: alert.disease?.name,
      diseaseType: alert.advisory?.diseaseType,
      title: alert.title,
    });
    const publicAdvisory = enrichCitizenAdvisoryContent(
      alert.advisory?.content ?? alert.message,
      {
        diseaseType: alert.advisory?.diseaseType ?? diseaseLabel,
        district: alert.targetZone,
        riskLevel: alert.severity,
      },
    );

    return {
      id: alert.id,
      title: alert.title,
      message: sanitizePublicHealthText(alert.message) || alert.message,
      disease: diseaseLabel,
      severity: alert.severity,
      channel: alert.channel,
      advisory: alert.advisory?.content ?? alert.message,
      advisoryId: alert.advisory?.id ?? null,
      advisoryTitle: alert.advisory?.title ?? null,
      status:
        alert.deliveryCount < 0 || alert.failedCount < 0
          ? "Rejected"
          : alert.isDelivered
            ? "Active"
            : "Pending",
      targetZone: alert.targetZone,
      isDelivered: alert.isDelivered,
      aiSuggested: alert.aiSuggested,
      sourceReportId: alert.sourceReportId,
      createdAt: alert.createdAt.toISOString(),
    };
  }

  private static async sendCriticalMortalityEmail(input: {
    alertId: string;
    diseaseType: string;
    district: string;
    totalCases: number;
    totalDeaths: number;
    mortalityRate: number;
    message: string;
  }) {
    const adminEmails = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { email: true },
    });

    const emails = adminEmails
      .map((u) => u.email)
      .filter((e): e is string => e != null && e !== "");
    emails.push(...EmailSender.parseConfiguredAlertRecipients());

    const emailResult = await EmailSender.sendBulkSpikeAlertEmails(emails, {
      disease: input.diseaseType,
      location: input.district,
      currentCases: input.totalCases,
      currentDeaths: input.totalDeaths,
      mortalityRate: input.mortalityRate,
      expectedCases: input.totalCases,
      severity: "CRITICAL",
      summary: input.message,
    });

    await prisma.alert.update({
      where: { id: input.alertId },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
        isDelivered: emailResult.delivered > 0,
      },
    });

    logger.warn("Critical mortality email notification processed", {
      alertId: input.alertId,
      diseaseType: input.diseaseType,
      district: input.district,
      delivered: emailResult.delivered,
      failed: emailResult.failed,
      duplicateResendEnabled: env.ALERT_RESEND_DUPLICATE_EMAILS,
    });
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

  private static async collectAdminNotificationEmails(): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        email: { not: null },
      },
      select: { email: true },
    });
    const emails = admins
      .map((u) => u.email)
      .filter((e): e is string => e != null && e.trim() !== "");
    emails.push(...EmailSender.parseConfiguredAlertRecipients());
    return [...new Set(emails)];
  }

  private static async notifyAdminsOfAiAlert(alert: {
    id: string;
    title: string;
    targetZone: string;
    severity: string;
    message: string;
    disease: { name: string } | null;
    advisory: { content: string; diseaseType?: string } | null;
  }) {
    const emails = await this.collectAdminNotificationEmails();
    if (emails.length === 0) {
      logger.warn("No admin emails configured for AI alert notification", {
        alertId: alert.id,
      });
      return;
    }

    const advisoryText =
      alert.advisory?.content?.trim() ||
      alert.message ||
      "Review the linked advisory draft in the admin dashboard.";

    const diseaseLabel = resolveDiseaseDisplayName({
      diseaseName: alert.disease?.name,
      diseaseType: alert.advisory?.diseaseType,
      title: alert.title,
    });

    const emailResult = await EmailSender.sendBulkAlertApprovalEmails(emails, {
      disease: diseaseLabel,
      location: alert.targetZone,
      advisory: sanitizePublicHealthText(advisoryText) || advisoryText,
      severity: alert.severity,
      alertTitle: alert.title,
    });

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
      },
    });

    logger.info("AI alert admin email notification sent", {
      alertId: alert.id,
      delivered: emailResult.delivered,
      failed: emailResult.failed,
    });
  }

  private static async triggerApprovalNotification(
    alert: AlertNotificationDetails,
  ) {
    const emails = await this.collectAdminNotificationEmails();

    const diseaseLabel = resolveDiseaseDisplayName({
      diseaseName: alert.disease?.name,
      diseaseType: alert.advisory?.diseaseType,
      title: alert.title,
    });
    const publicAdvisory = sanitizePublicHealthText(
      alert.advisory?.content ?? alert.message,
    );

    const emailResult = await EmailSender.sendBulkAlertApprovalEmails(emails, {
      disease: diseaseLabel,
      location: alert.targetZone,
      advisory: publicAdvisory,
      severity: alert.severity,
      alertTitle: alert.title ?? `Health alert: ${diseaseLabel}`,
    });

    const citizensInDistrict = await prisma.user.findMany({
      where: {
        role: "CITIZEN",
        assignedDistrict: alert.targetZone,
        isActive: true,
        phoneNumber: { not: null },
      },
      select: { phoneNumber: true },
    });
    const phones = citizensInDistrict
      .map((u) => u.phoneNumber)
      .filter(Boolean) as string[];
    let smsDelivered = 0;
    let smsFailed = 0;
    if (phones.length > 0) {
      const smsResult = await SmsSender.sendBulkSms(
        phones,
        buildCitizenSmsAlert(diseaseLabel, alert.targetZone),
      );
      smsDelivered = smsResult.delivered;
      smsFailed = smsResult.failed;
    }

    await prisma.alert.update({
      where: { id: alert.id },
      data: {
        deliveryCount: emailResult.delivered + smsDelivered,
        failedCount: emailResult.failed + smsFailed,
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

  static async getAllAlerts(filters?: { aiSuggested?: boolean; pending?: boolean }) {
    const where: Record<string, unknown> = {};

    if (typeof filters?.aiSuggested === "boolean") {
      where.aiSuggested = filters.aiSuggested;
    }

    if (filters?.pending === true) {
      where.isDelivered = false;
      where.deliveryCount = { gte: 0 };
      where.failedCount = { gte: 0 };
    }

    const alerts = await prisma.alert.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
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

  static async getAlertById(alertId: string) {
    if (!alertId) {
      throw new AppError("Invalid alert id", 400);
    }

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        disease: true,
        advisory: true,
      },
    });

    if (!alert) {
      throw new AppError("Alert not found", 404);
    }

    return this.toAlertManagementView(alert);
  }

  static async approveAlert(alertId: string, approverUserId: string) {
    if (!alertId) {
      throw new AppError("Invalid alert id", 400);
    }

    const existingAlert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        disease: true,
        advisory: {
          select: {
            id: true,
            status: true,
            content: true,
            diseaseType: true,
            title: true,
          },
        },
      },
    });

    if (!existingAlert) {
      throw new AppError("Alert not found", 404);
    }

    const updatedAlert = await prisma.$transaction(async (tx) => {
      // Cascade: approving broadcast also publishes the linked advisory (admin one-step workflow).
      if (
        existingAlert.advisoryId &&
        existingAlert.advisory &&
        existingAlert.advisory.status !== AdvisoryStatus.APPROVED
      ) {
        await tx.advisory.update({
          where: { id: existingAlert.advisoryId },
          data: {
            status: AdvisoryStatus.APPROVED,
            approvedById: approverUserId,
            approvedAt: new Date(),
          },
        });
      }

      return tx.alert.update({
        where: { id: alertId },
        data: { isDelivered: true },
        include: {
          disease: true,
          advisory: true,
        },
      });
    });

    const managementView = this.toAlertManagementView(updatedAlert);
    await AuditService.append({
      action: "ALERT_APPROVED",
      actorUserId: approverUserId,
      resourceType: "Alert",
      resourceId: alertId,
    });
    await this.triggerApprovalNotification(updatedAlert);

    return managementView;
  }

  static async rejectAlert(alertId: string, actorUserId: string) {
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
        deliveryCount: -1,
        failedCount: -1,
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    const view = this.toAlertManagementView(updatedAlert);
    await AuditService.append({
      action: "ALERT_REJECTED",
      actorUserId,
      resourceType: "Alert",
      resourceId: alertId,
    });
    return view;
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
        isDelivered: isDelivered ?? !aiSuggested,
      },
      include: {
        disease: true,
        advisory: true,
      },
    });

    if (alert.isDelivered) {
      void this.triggerApprovalNotification(alert);
    }

    return this.toAlertManagementView(alert);
  }

  /**
   * Notification feed for the navbar bell.
   * - ADMIN / RESEARCHER see the most recent alerts globally.
   * - HEW / CITIZEN see alerts whose targetZone matches their region or
   *   assignedDistrict (case-insensitive).
   */
  static async getNotificationsForUserId(userId: string, limit?: number) {
    const cap = Math.max(1, Math.min(50, limit ?? 10));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, region: true, assignedDistrict: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const role = String(user.role).toUpperCase();
    const isPrivileged = role === "ADMIN" || role === "RESEARCHER";

    const orFilters: Array<{
      targetZone: { equals: string; mode: "insensitive" };
    }> = [];
    if (user.region) {
      orFilters.push({
        targetZone: { equals: user.region, mode: "insensitive" },
      });
    }
    if (user.assignedDistrict) {
      orFilters.push({
        targetZone: {
          equals: user.assignedDistrict,
          mode: "insensitive",
        },
      });
    }

    const zoneFilter =
      orFilters.length > 0
        ? { OR: orFilters }
        : { id: "__none__" };

    const where = isPrivileged
      ? { isDelivered: true }
      : { isDelivered: true, ...zoneFilter };

    const alerts = await prisma.alert.findMany({
      where,
      include: { disease: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: cap,
    });

    const visibleAlerts = isPrivileged ? alerts : alerts.filter((a) => a.isDelivered);

    return visibleAlerts.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      severity: a.severity,
      targetZone: a.targetZone,
      disease: a.disease?.name ?? null,
      isDelivered: a.isDelivered,
      aiSuggested: a.aiSuggested,
      createdAt: a.createdAt,
    }));
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
    const highDeathSignal = totalDeaths >= 3 || mortalityRate > 0.1;
    if (!highDeathSignal) return;

    const title = `CRITICAL: ${diseaseType} mortality rate exceeded 10% in ${district}`;
    const message =
      `In the last 24 hours, ${district} reported ${totalDeaths} deaths out of ` +
      `${totalCases} ${diseaseType} cases (${(mortalityRate * 100).toFixed(1)}% mortality rate). ` +
      `This is a serious mortality signal and may indicate a severe outbreak spike. Immediate response, verification, and field follow-up are required.`;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingAlert = await prisma.alert.findFirst({
      where: {
        targetZone: district,
        title,
        createdAt: { gte: oneDayAgo },
      },
      select: { id: true },
    });

    if (existingAlert) {
      logger.info("Skipping duplicate mortality alert", {
        alertId: existingAlert.id,
        diseaseType,
        district,
        resendDuplicateEmail: env.ALERT_RESEND_DUPLICATE_EMAILS,
      });
      if (env.ALERT_RESEND_DUPLICATE_EMAILS) {
        await this.sendCriticalMortalityEmail({
          alertId: existingAlert.id,
          diseaseType,
          district,
          totalCases,
          totalDeaths,
          mortalityRate,
          message,
        });
      }
      return;
    }

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

    await this.sendCriticalMortalityEmail({
      alertId: alert.id,
      diseaseType,
      district,
      totalCases,
      totalDeaths,
      mortalityRate,
      message,
    });
  }
}
