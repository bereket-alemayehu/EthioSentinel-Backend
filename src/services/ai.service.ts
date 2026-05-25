import http from "http";
import https from "https";
import { URL } from "url";
import { prisma } from "../lib/prisma";
import { env } from "../config/env.config";
import Logger from "../utils/logger";
import { EmailSender } from "../utils/EmailSender";
import { SmsSender } from "../utils/SmsSender";
import {
  buildAdminSpikeSummary,
  buildCitizenAdvisoryContent,
  buildCitizenAdvisoryTitle,
  buildCitizenAlertMessage,
  buildCitizenAlertTitle,
  buildCitizenSmsAlert,
} from "../utils/healthMessaging";

type WeeklyAggregate = {
  weekStart: string;
  weekEnd: string;
  totalCases: number;
  totalDeaths: number;
  reportCount: number;
};

type ZScorePayload = {
  method: "zscore";
  current_cases: number;
  historical_mean: number;
  std_dev: number;
};

type ArimaPayload = {
  method: "arima";
  current_cases: number;
  historical_series: number[];
  arima_order: [number, number, number];
  anomaly_threshold: number;
};

type ZScoreContext = {
  payload: ZScorePayload;
  sampleSize: number;
  lookbackStart: Date;
  lookbackEnd: Date;
};

type AdHocZScoreResult = {
  district: string;
  diseaseType: string;
  currentCases: number;
  currentDeaths: number;
  mortalityRate: number;
  mortalitySignal: boolean;
  historicalMean: number;
  stdDev: number;
  zScore?: number;
  classification: "ANOMALY" | "NORMAL";
  sampleSize: number;
  lookbackStart: Date;
  lookbackEnd: Date;
  thresholdSigma: number;
  signalId?: string;
};

type AdHocPredictionResult = {
  district: string;
  diseaseType: string;
  currentCases: number;
  forecastNext: number;
  residualStd: number;
  zScore?: number;
  classification: "ANOMALY" | "NORMAL";
  sampleSize: number;
  lookbackStart: Date;
  lookbackEnd: Date;
  thresholdSigma: number;
  arimaOrder: [number, number, number];
};

type DetectionApiResponse = {
  method?: string;
  z_score?: number;
  classification?: string;
  forecast_next?: number;
  residual_std?: number;
  anomaly_threshold?: number;
};

type NlpAdvisoryDraftPayload = {
  diseaseType: string;
  regionName: string;
  language: string;
  riskLevel?: string;
  title: string;
  content: string;
  sourceReportId?: string;
};

export class AIService {
  private static readonly LOOKBACK_DAYS = 7;

  private static getWeekStartUTC(date: Date): Date {
    const utcDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utcDate.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
    return utcDate;
  }

  private static buildWeeklyAggregates(
    reports: Array<{ timestamp: Date; caseCount: number; deathCount: number }>,
  ): WeeklyAggregate[] {
    const weeklyMap = new Map<string, WeeklyAggregate>();

    for (const report of reports) {
      const weekStartDate = this.getWeekStartUTC(report.timestamp);
      const weekStart = weekStartDate.toISOString().slice(0, 10);

      if (!weeklyMap.has(weekStart)) {
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
        weeklyMap.set(weekStart, {
          weekStart,
          weekEnd: weekEndDate.toISOString().slice(0, 10),
          totalCases: 0,
          totalDeaths: 0,
          reportCount: 0,
        });
      }

      const weekAggregate = weeklyMap.get(weekStart)!;
      weekAggregate.totalCases += report.caseCount;
      weekAggregate.totalDeaths += report.deathCount;
      weekAggregate.reportCount += 1;
    }

    return Array.from(weeklyMap.values()).sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );
  }

  private static computeStats(values: number[]) {
    if (values.length === 0) {
      return {
        sampleSize: 0,
        meanCases: 0,
        stdDevCases: 0,
        minCases: 0,
        maxCases: 0,
      };
    }

    const sum = values.reduce((acc, value) => acc + value, 0);
    const meanCases = sum / values.length;
    const variance =
      values.reduce((acc, value) => acc + (value - meanCases) ** 2, 0) /
      values.length;
    const stdDevCases = Math.sqrt(variance);

    return {
      sampleSize: values.length,
      meanCases,
      stdDevCases,
      minCases: Math.min(...values),
      maxCases: Math.max(...values),
    };
  }

  private static async buildZScorePayload(
    reportId: string,
  ): Promise<ZScoreContext | null> {
    const report = await prisma.diseaseReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        district: true,
        diseaseType: true,
        timestamp: true,
        caseCount: true,
        deathCount: true,
      },
    });

    if (!report) {
      Logger.warn("Skipping AI anomaly call: report not found", { reportId });
      return null;
    }

    const lookbackStart = new Date(report.timestamp);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - this.LOOKBACK_DAYS);

    const historicalReports = await prisma.diseaseReport.findMany({
      where: {
        district: report.district,
        diseaseType: report.diseaseType,
        timestamp: {
          gte: lookbackStart,
          lte: report.timestamp,
        },
      },
      select: {
        timestamp: true,
        caseCount: true,
        deathCount: true,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    const caseValues = historicalReports.map(
      (entry: { caseCount: number }) => entry.caseCount,
    );
    const stats = this.computeStats(caseValues);

    return {
      payload: {
        method: "zscore",
        current_cases: report.caseCount,
        historical_mean: Number(stats.meanCases.toFixed(4)),
        std_dev: Number(stats.stdDevCases.toFixed(4)),
      },
      sampleSize: stats.sampleSize,
      lookbackStart,
      lookbackEnd: report.timestamp,
    };
  }

  private static async postJson(urlString: string, payload: unknown) {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;
    const requestBody = JSON.stringify(payload);

    return new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const req = client.request(
          {
            method: "POST",
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(requestBody),
            },
            timeout: env.AI_SERVICE_TIMEOUT_MS,
          },
          (res) => {
            const chunks: Buffer[] = [];

            res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            res.on("end", () => {
              resolve({
                statusCode: res.statusCode ?? 500,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          },
        );

        req.on("timeout", () => {
          req.destroy(new Error("AI service request timed out"));
        });
        req.on("error", reject);
        req.write(requestBody);
        req.end();
      },
    );
  }

  private static parseDetectionApiResponse(
    body: string,
  ): DetectionApiResponse | null {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed as DetectionApiResponse;
    } catch {
      return null;
    }
  }

  private static getSeverityFromZScore(zScore?: number): "HIGH" | "CRITICAL" {
    if (typeof zScore === "number" && zScore >= 3) {
      return "CRITICAL";
    }
    return "HIGH";
  }

  private static getRiskLevelFromZScore(
    zScore?: number,
  ): "MODERATE" | "HIGH" | "CRITICAL" {
    if (typeof zScore === "number" && zScore >= 3) return "CRITICAL";
    if (typeof zScore === "number" && zScore >= 2) return "HIGH";
    return "MODERATE";
  }

  private static buildSuggestedAdvisoryContent(input: {
    diseaseType: string;
    district: string;
    currentCases: number;
    historicalMean: number;
    zScore?: number;
  }): string {
    const riskLevel = this.getRiskLevelFromZScore(input.zScore);
    return buildCitizenAdvisoryContent({
      diseaseType: input.diseaseType,
      district: input.district,
      currentCases: input.currentCases,
      historicalMean: input.historicalMean,
      riskLevel,
    });
  }

  private static async createAiSuggestedAdvisoryDraft(input: {
    reportId: string;
    diseaseType: string;
    district: string;
    currentCases: number;
    historicalMean: number;
    zScore?: number;
  }): Promise<{ id: string } | null> {
    const districtRow = await prisma.district.findFirst({
      where: {
        OR: [
          { name: { equals: input.district, mode: "insensitive" } },
          { code: { equals: input.district, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        regionId: true,
        name: true,
      },
    });

    if (!districtRow) {
      Logger.warn("AI advisory draft skipped: district not found", {
        reportId: input.reportId,
        district: input.district,
      });
      return null;
    }

    const existing = await prisma.advisory.findFirst({
      where: {
        sourceReportId: input.reportId,
        generatedByAI: true,
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    const riskLevel = this.getRiskLevelFromZScore(input.zScore);

    return prisma.advisory.create({
      data: {
        diseaseType: input.diseaseType,
        regionId: districtRow.regionId,
        districtId: districtRow.id,
        sourceReportId: input.reportId,
        title: buildCitizenAdvisoryTitle(input.diseaseType, districtRow.name),
        content: this.buildSuggestedAdvisoryContent(input),
        language: "ENGLISH",
        status: "DRAFT",
        riskLevel,
        generatedByAI: true,
      },
      select: { id: true },
    });
  }

  private static async createAdminReviewAlertAndNotify(input: {
    reportId: string;
    diseaseType: string;
    district: string;
    currentCases: number;
    historicalMean: number;
    zScore?: number;
    advisoryDraftId?: string;
  }): Promise<string | undefined> {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        aiSuggested: true,
        sourceReportId: input.reportId,
      },
      select: { id: true },
    });

    if (existingAlert) {
      Logger.info("Skipping duplicate AI alert for source report", {
        reportId: input.reportId,
        existingAlertId: existingAlert.id,
      });
      return existingAlert.id;
    }

    const severity = this.getSeverityFromZScore(input.zScore);
    const message = buildCitizenAlertMessage({
      diseaseType: input.diseaseType,
      district: input.district,
      currentCases: input.currentCases,
      historicalMean: input.historicalMean,
    });
    const adminSummary = buildAdminSpikeSummary({
      diseaseType: input.diseaseType,
      district: input.district,
      currentCases: input.currentCases,
      historicalMean: input.historicalMean,
      zScore: input.zScore,
    });

    const diseaseRow = await prisma.disease.findFirst({
      where: { name: { equals: input.diseaseType, mode: "insensitive" } },
      select: { id: true },
    });

    const createdAlert = await prisma.alert.create({
      data: {
        targetZone: input.district,
        title: buildCitizenAlertTitle(input.diseaseType, input.district),
        message,
        diseaseId: diseaseRow?.id,
        severity,
        channel: "EMAIL",
        isDelivered: false,
        advisoryId: input.advisoryDraftId,
        sourceReportId: input.reportId,
        aiSuggested: true,
      },
      select: { id: true },
    });

    let aiAdvisoryDraft: string | undefined;
    if (input.advisoryDraftId) {
      const draft = await prisma.advisory.findUnique({
        where: { id: input.advisoryDraftId },
        select: { title: true, content: true },
      });
      if (draft) {
        aiAdvisoryDraft = `${draft.title}\n\n${draft.content}`;
      }
    }

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { email: true },
    });

    const emails = admins
      .map((u: { email: string | null }) => u.email)
      .filter(Boolean) as string[];
    emails.push(...EmailSender.parseConfiguredAlertRecipients());
    const emailResult = await EmailSender.sendBulkSpikeAlertEmails([...new Set(emails)], {
      disease: input.diseaseType,
      location: input.district,
      currentCases: input.currentCases,
      currentDeaths: 0,
      expectedCases: input.historicalMean,
      zScore: input.zScore,
      severity,
      summary: adminSummary,
      aiAdvisoryDraft,
    });

    await prisma.alert.update({
      where: { id: createdAlert.id },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
      },
    });

    Logger.warn("AI anomaly admin notification created (awaiting approval before public SMS)", {
      reportId: input.reportId,
      alertId: createdAlert.id,
      advisoryDraftId: input.advisoryDraftId ?? null,
      diseaseType: input.diseaseType,
      district: input.district,
      severity,
      emailsDelivered: emailResult.delivered,
      emailsFailed: emailResult.failed,
    });

    return createdAlert.id;
  }

  private static async createSpikeAlertAndEmailAdmins(input: {
    diseaseType: string;
    district: string;
    currentCases: number;
    currentDeaths?: number;
    mortalityRate?: number;
    expectedCases: number;
    zScore?: number;
    source: "AUTOMATED_REPORT" | "MANUAL_ANALYSIS" | "PREDICTION";
  }): Promise<string | undefined> {
    const severity =
      typeof input.currentDeaths === "number" &&
      input.currentDeaths > 0 &&
      (input.currentDeaths >= 3 || (input.mortalityRate ?? 0) >= 0.1)
        ? "CRITICAL"
        : this.getSeverityFromZScore(input.zScore);
    const oneDayAgo = new Date();
    oneDayAgo.setUTCDate(oneDayAgo.getUTCDate() - 1);
    const title = buildCitizenAlertTitle(input.diseaseType, input.district);
    const message = buildCitizenAlertMessage({
      diseaseType: input.diseaseType,
      district: input.district,
      currentCases: input.currentCases,
      historicalMean: input.expectedCases,
    });
    const adminSummary = buildAdminSpikeSummary({
      diseaseType: input.diseaseType,
      district: input.district,
      currentCases: input.currentCases,
      historicalMean: input.expectedCases,
      zScore: input.zScore,
    });

    const existingAlert = await prisma.alert.findFirst({
      where: {
        aiSuggested: true,
        targetZone: input.district,
        title,
        createdAt: { gte: oneDayAgo },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (existingAlert) {
      Logger.info("Skipping duplicate spike email alert", {
        alertId: existingAlert.id,
        diseaseType: input.diseaseType,
        district: input.district,
      });
      return existingAlert.id;
    }

    const diseaseRow = await prisma.disease.findFirst({
      where: { name: { equals: input.diseaseType, mode: "insensitive" } },
      select: { id: true },
    });

    const createdAlert = await prisma.alert.create({
      data: {
        targetZone: input.district,
        title,
        message,
        severity,
        channel: "EMAIL",
        isDelivered: false,
        aiSuggested: true,
        diseaseId: diseaseRow?.id,
      },
      select: { id: true },
    });

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { email: true },
    });
    const emails = [
      ...new Set([
        ...(admins
          .map((u: { email: string | null }) => u.email)
          .filter(Boolean) as string[]),
        ...EmailSender.parseConfiguredAlertRecipients(),
      ]),
    ];

    const emailResult = await EmailSender.sendBulkSpikeAlertEmails(emails, {
      disease: input.diseaseType,
      location: input.district,
      currentCases: input.currentCases,
      currentDeaths: input.currentDeaths,
      mortalityRate: input.mortalityRate,
      expectedCases: input.expectedCases,
      zScore: input.zScore,
      severity,
      summary: adminSummary,
    });

    await prisma.alert.update({
      where: { id: createdAlert.id },
      data: {
        deliveryCount: emailResult.delivered,
        failedCount: emailResult.failed,
        isDelivered: emailResult.delivered > 0,
      },
    });

    Logger.warn("Spike email alert created for admins", {
      alertId: createdAlert.id,
      diseaseType: input.diseaseType,
      district: input.district,
      severity,
      delivered: emailResult.delivered,
      failed: emailResult.failed,
    });

    return createdAlert.id;
  }

  static enqueueZScoreAnomalyTrigger(reportId: string): void {
    setImmediate(async () => {
      await this.triggerZScoreAnomaly(reportId);
    });
  }

  static async triggerZScoreAnomaly(reportId: string): Promise<void> {
    const context = await this.buildZScorePayload(reportId);
    if (!context) {
      return;
    }
    const { payload, sampleSize, lookbackStart, lookbackEnd } = context;
    if (payload.std_dev <= 0) {
      Logger.info("Skipping AI anomaly trigger due to zero variance baseline", {
        reportId,
        currentCases: payload.current_cases,
        historicalMean: payload.historical_mean,
        stdDev: payload.std_dev,
      });
      return;
    }

    const endpoint = new URL(
      env.AI_SERVICE_ZSCORE_PATH,
      env.AI_SERVICE_BASE_URL,
    ).toString();

    let attempt = 0;
    let lastErrorMessage = "Unknown AI service error";

    while (attempt < env.AI_SERVICE_RETRY_COUNT) {
      attempt += 1;
      try {
        const response = await this.postJson(endpoint, payload);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const parsedResponse = this.parseDetectionApiResponse(response.body);
          const classification = String(
            parsedResponse?.classification ?? "",
          ).toUpperCase();
          const zScore =
            typeof parsedResponse?.z_score === "number"
              ? parsedResponse.z_score
              : undefined;

          let advisoryDraftId: string | undefined;
          let alertId: string | undefined;

          const reportRow = await prisma.diseaseReport.findUnique({
            where: { id: reportId },
            select: {
              id: true,
              diseaseType: true,
              district: true,
              caseCount: true,
            },
          });

          if (classification === "ANOMALY" && reportRow) {
            const advisoryDraft = await this.createAiSuggestedAdvisoryDraft({
              reportId: reportRow.id,
              diseaseType: reportRow.diseaseType,
              district: reportRow.district,
              currentCases: reportRow.caseCount,
              historicalMean: payload.historical_mean,
              zScore,
            });
            advisoryDraftId = advisoryDraft?.id;

            alertId = await this.createAdminReviewAlertAndNotify({
              reportId: reportRow.id,
              diseaseType: reportRow.diseaseType,
              district: reportRow.district,
              currentCases: reportRow.caseCount,
              historicalMean: payload.historical_mean,
              zScore,
              advisoryDraftId,
            });
          }

          if (reportRow) {
            await this.persistAnomalySignal({
              reportId,
              district: {
                district: reportRow.district,
                diseaseType: reportRow.diseaseType,
              },
              payload,
              zScore,
              classification:
                classification === "ANOMALY" ? "ANOMALY" : "NORMAL",
              sampleSize,
              lookbackStart,
              lookbackEnd,
              advisoryId: advisoryDraftId,
              alertId,
              manual: false,
            });
          }

          Logger.info("AI anomaly trigger sent successfully", {
            reportId,
            endpoint,
            attempt,
            statusCode: response.statusCode,
            responseBody: response.body.slice(0, 400),
          });
          return;
        }

        lastErrorMessage = `AI service returned status ${response.statusCode}`;
        Logger.warn("AI anomaly trigger returned non-success status", {
          reportId,
          attempt,
          statusCode: response.statusCode,
          responseBody: response.body.slice(0, 400),
        });
      } catch (error) {
        lastErrorMessage =
          error instanceof Error ? error.message : String(error);
        Logger.warn("AI anomaly trigger attempt failed", {
          reportId,
          attempt,
          error: lastErrorMessage,
        });
      }

      if (attempt < env.AI_SERVICE_RETRY_COUNT) {
        await new Promise((resolve) =>
          setTimeout(resolve, env.AI_SERVICE_RETRY_DELAY_MS * attempt),
        );
      }
    }

    Logger.error("AI anomaly trigger exhausted retries", {
      reportId,
      endpoint,
      attempts: env.AI_SERVICE_RETRY_COUNT,
      error: lastErrorMessage,
    });
  }

  private static async persistAnomalySignal(input: {
    reportId?: string;
    district: { district: string; diseaseType: string };
    payload: ZScorePayload;
    zScore?: number;
    classification: "ANOMALY" | "NORMAL";
    sampleSize: number;
    lookbackStart: Date;
    lookbackEnd: Date;
    advisoryId?: string;
    alertId?: string;
    manual: boolean;
    notes?: string;
  }): Promise<{ id: string }> {
    return prisma.anomalySignal.create({
      data: {
        reportId: input.reportId,
        district: input.district.district,
        diseaseType: input.district.diseaseType,
        currentCases: input.payload.current_cases,
        historicalMean: input.payload.historical_mean,
        stdDev: input.payload.std_dev,
        zScore: input.zScore,
        classification: input.classification,
        method: "ZSCORE",
        sampleSize: input.sampleSize,
        lookbackStart: input.lookbackStart,
        lookbackEnd: input.lookbackEnd,
        advisoryId: input.advisoryId,
        alertId: input.alertId,
        manual: input.manual,
        notes: input.notes,
      },
      select: { id: true },
    });
  }

  /**
   * Ad-hoc Z-score analyzer used by /analytics/anomalies/run.
   * Pulls historical reports for (district, diseaseType) within lookback window
   * and calls the Python /detect endpoint. Optionally persists the signal.
   */
  static async runAdHocZScore(input: {
    district: string;
    diseaseType: string;
    lookbackDays?: number;
    persist?: boolean;
    notes?: string;
  }): Promise<AdHocZScoreResult> {
    const lookbackDays = Math.max(1, Math.min(180, input.lookbackDays ?? 7));
    const lookbackEnd = new Date();
    const lookbackStart = new Date(lookbackEnd);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - lookbackDays);

    const historicalReports = await prisma.diseaseReport.findMany({
      where: {
        district: { equals: input.district, mode: "insensitive" },
        diseaseType: { equals: input.diseaseType, mode: "insensitive" },
        timestamp: { gte: lookbackStart, lte: lookbackEnd },
      },
      select: { timestamp: true, caseCount: true, deathCount: true },
      orderBy: { timestamp: "asc" },
    });

    if (historicalReports.length === 0) {
      throw new Error(
        `No reports found for ${input.diseaseType} in ${input.district} within the last ${lookbackDays} days`,
      );
    }

    const values = historicalReports.map((r) => r.caseCount);
    const currentCases = values[values.length - 1];
    const currentDeaths = historicalReports[historicalReports.length - 1]?.deathCount ?? 0;
    const totalCases = historicalReports.reduce((sum, report) => sum + report.caseCount, 0);
    const totalDeaths = historicalReports.reduce((sum, report) => sum + report.deathCount, 0);
    const mortalityRate = totalCases > 0 ? totalDeaths / totalCases : 0;
    const mortalitySignal =
      currentDeaths >= 3 || (currentDeaths > 0 && mortalityRate >= 0.1);
    const baseline = values.slice(0, -1);
    const baselineForStats = baseline.length > 0 ? baseline : values;
    const stats = this.computeStats(baselineForStats);

    const payload: ZScorePayload = {
      method: "zscore",
      current_cases: currentCases,
      historical_mean: Number(stats.meanCases.toFixed(4)),
      std_dev: Number(stats.stdDevCases.toFixed(4)),
    };

    let zScore: number | undefined;
    let classification: "ANOMALY" | "NORMAL" = "NORMAL";

    if (payload.std_dev > 0) {
      const endpoint = new URL(
        env.AI_SERVICE_ZSCORE_PATH,
        env.AI_SERVICE_BASE_URL,
      ).toString();
      try {
        const response = await this.postJson(endpoint, payload);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const parsed = this.parseDetectionApiResponse(response.body);
          if (typeof parsed?.z_score === "number") {
            zScore = parsed.z_score;
          }
          if (
            String(parsed?.classification ?? "").toUpperCase() === "ANOMALY"
          ) {
            classification = "ANOMALY";
          }
        } else {
          // Fallback local calc if Python service unavailable
          zScore = (currentCases - payload.historical_mean) / payload.std_dev;
          classification = zScore > 2 ? "ANOMALY" : "NORMAL";
        }
      } catch (error) {
        Logger.warn("Ad-hoc z-score: Python service unavailable, falling back to local", {
          error: error instanceof Error ? error.message : String(error),
        });
        zScore = (currentCases - payload.historical_mean) / payload.std_dev;
        classification = zScore > 2 ? "ANOMALY" : "NORMAL";
      }
    }
    if (mortalitySignal) {
      classification = "ANOMALY";
    }

    // Manual analysis never creates alerts or sends admin emails — only registered
    // report ingestion (automatic Z-score / mortality checks) triggers those.
    let signalId: string | undefined;

    if (input.persist) {
      const persisted = await this.persistAnomalySignal({
        district: { district: input.district, diseaseType: input.diseaseType },
        payload,
        zScore,
        classification,
        sampleSize: stats.sampleSize,
        lookbackStart,
        lookbackEnd,
        manual: true,
        notes: input.notes,
      });
      signalId = persisted.id;
    }

    return {
      district: input.district,
      diseaseType: input.diseaseType,
      currentCases,
      currentDeaths,
      mortalityRate: Number(mortalityRate.toFixed(4)),
      mortalitySignal,
      historicalMean: payload.historical_mean,
      stdDev: payload.std_dev,
      zScore: typeof zScore === "number" ? Number(zScore.toFixed(4)) : undefined,
      classification,
      sampleSize: stats.sampleSize,
      lookbackStart,
      lookbackEnd,
      thresholdSigma: 2,
      signalId,
    };
  }

  /**
   * Ad-hoc ARIMA forecaster used by /analytics/predictions/run.
   * The latest report is treated as the observed value to classify against the
   * next-step forecast generated from earlier reports in the lookback window.
   */
  static async runAdHocPrediction(input: {
    district: string;
    diseaseType: string;
    lookbackDays?: number;
    thresholdSigma?: number;
    arimaOrder?: [number, number, number];
  }): Promise<AdHocPredictionResult> {
    const lookbackDays = Math.max(8, Math.min(180, input.lookbackDays ?? 30));
    const thresholdSigma = Math.max(
      0.1,
      Math.min(10, input.thresholdSigma ?? 1.5),
    );
    const arimaOrder = input.arimaOrder ?? [1, 1, 1];
    const lookbackEnd = new Date();
    const lookbackStart = new Date(lookbackEnd);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - lookbackDays);

    const reports = await prisma.diseaseReport.findMany({
      where: {
        district: { equals: input.district, mode: "insensitive" },
        diseaseType: { equals: input.diseaseType, mode: "insensitive" },
        timestamp: { gte: lookbackStart, lte: lookbackEnd },
      },
      select: { timestamp: true, caseCount: true },
      orderBy: { timestamp: "asc" },
    });

    if (reports.length < 9) {
      throw new Error(
        `At least 9 reports are required for ARIMA prediction for ${input.diseaseType} in ${input.district}; found ${reports.length}`,
      );
    }

    const values = reports.map((r) => r.caseCount);
    const currentCases = values[values.length - 1];
    const historicalSeries = values.slice(0, -1);

    const payload: ArimaPayload = {
      method: "arima",
      current_cases: currentCases,
      historical_series: historicalSeries,
      arima_order: arimaOrder,
      anomaly_threshold: thresholdSigma,
    };

    const endpoint = new URL(
      env.AI_SERVICE_ZSCORE_PATH,
      env.AI_SERVICE_BASE_URL,
    ).toString();

    const response = await this.postJson(endpoint, payload);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `Prediction service returned status ${response.statusCode}: ${response.body.slice(0, 200)}`,
      );
    }

    const parsed = this.parseDetectionApiResponse(response.body);
    if (
      typeof parsed?.forecast_next !== "number" ||
      typeof parsed?.residual_std !== "number"
    ) {
      throw new Error("Prediction service returned an invalid ARIMA response");
    }

    return {
      district: input.district,
      diseaseType: input.diseaseType,
      currentCases,
      forecastNext: parsed.forecast_next,
      residualStd: parsed.residual_std,
      zScore:
        typeof parsed.z_score === "number"
          ? Number(parsed.z_score.toFixed(4))
          : undefined,
      classification:
        String(parsed.classification ?? "").toUpperCase() === "ANOMALY"
          ? "ANOMALY"
          : "NORMAL",
      sampleSize: historicalSeries.length,
      lookbackStart,
      lookbackEnd,
      thresholdSigma,
      arimaOrder,
    };
  }

  /**
   * Persists an NLP-generated advisory draft pushed by the Python AI worker.
   * Each language variant is stored as a separate Advisory row with status DRAFT.
   */
  static async persistNlpAdvisoryDraft(
    payload: NlpAdvisoryDraftPayload,
  ): Promise<{ id: string }> {
    const region = await prisma.region.findFirst({
      where: { name: { equals: payload.regionName, mode: "insensitive" } },
      select: { id: true },
    });

    if (!region) {
      throw new Error(`Region not found: "${payload.regionName}"`);
    }

    const advisory = await prisma.advisory.create({
      data: {
        diseaseType: payload.diseaseType,
        regionId: region.id,
        language: payload.language,
        riskLevel: payload.riskLevel ?? "MODERATE",
        title: payload.title,
        content: payload.content,
        status: "DRAFT",
        sourceReportId: payload.sourceReportId ?? null,
      },
      select: { id: true },
    });

    Logger.info("NLP advisory draft persisted", {
      id: advisory.id,
      diseaseType: payload.diseaseType,
      language: payload.language,
    });

    return advisory;
  }
}
