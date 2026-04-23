import http from "http";
import https from "https";
import { URL } from "url";
import { prisma } from "../lib/prisma";
import { env } from "../config/env.config";
import { logger } from "../utils/logger";

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
  private static readonly LOOKBACK_DAYS = 56;

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
  ): Promise<ZScorePayload | null> {
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
      logger.warn("Skipping AI anomaly call: report not found", { reportId });
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

    const caseValues = historicalReports.map((entry) => entry.caseCount);
    const stats = this.computeStats(caseValues);

    return {
      method: "zscore",
      current_cases: report.caseCount,
      historical_mean: Number(stats.meanCases.toFixed(4)),
      std_dev: Number(stats.stdDevCases.toFixed(4)),
    };
  }

  private static async postJson(urlString: string, payload: unknown) {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;
    const requestBody = JSON.stringify(payload);

    return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
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
    });
  }

  static enqueueZScoreAnomalyTrigger(reportId: string): void {
    setImmediate(async () => {
      await this.triggerZScoreAnomaly(reportId);
    });
  }

  static async triggerZScoreAnomaly(reportId: string): Promise<void> {
    const payload = await this.buildZScorePayload(reportId);
    if (!payload) {
      return;
    }
    if (payload.std_dev <= 0) {
      logger.info("Skipping AI anomaly trigger due to zero variance baseline", {
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
          logger.info("AI anomaly trigger sent successfully", {
            reportId,
            endpoint,
            attempt,
            statusCode: response.statusCode,
            responseBody: response.body.slice(0, 400),
          });
          return;
        }

        lastErrorMessage = `AI service returned status ${response.statusCode}`;
        logger.warn("AI anomaly trigger returned non-success status", {
          reportId,
          attempt,
          statusCode: response.statusCode,
          responseBody: response.body.slice(0, 400),
        });
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : String(error);
        logger.warn("AI anomaly trigger attempt failed", {
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

    logger.error("AI anomaly trigger exhausted retries", {
      reportId,
      endpoint,
      attempts: env.AI_SERVICE_RETRY_COUNT,
      error: lastErrorMessage,
    });
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

    logger.info("NLP advisory draft persisted", {
      id: advisory.id,
      diseaseType: payload.diseaseType,
      language: payload.language,
    });

    return advisory;
  }
}
