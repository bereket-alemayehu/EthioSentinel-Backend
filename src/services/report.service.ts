import { prisma } from "../lib/prisma";
import { ReportStatus, Role } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { AIService } from "./ai.service";
import { AlertService } from "./alert.service";
import { logger } from "../utils/logger";
import { validateAndSanitizeReport } from "../validations/report.validation";

type WeeklyReportAggregate = {
  weekStart: string;
  weekEnd: string;
  totalCases: number;
  totalDeaths: number;
  reportCount: number;
};

export class ReportService {
  private static getWeekStartUTC(date: Date): Date {
    const utcDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utcDate.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
    return utcDate;
  }

  static async getWeeklyAggregatedReports(): Promise<WeeklyReportAggregate[]> {
    const reports = await prisma.diseaseReport.findMany({
      select: {
        timestamp: true,
        caseCount: true,
        deathCount: true,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    const weeklyMap = new Map<string, WeeklyReportAggregate>();

    for (const report of reports) {
      const weekStartDate = this.getWeekStartUTC(report.timestamp);
      const weekStartKey = weekStartDate.toISOString().slice(0, 10);

      if (!weeklyMap.has(weekStartKey)) {
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);

        weeklyMap.set(weekStartKey, {
          weekStart: weekStartKey,
          weekEnd: weekEndDate.toISOString().slice(0, 10),
          totalCases: 0,
          totalDeaths: 0,
          reportCount: 0,
        });
      }

      const aggregate = weeklyMap.get(weekStartKey)!;
      aggregate.totalCases += report.caseCount;
      aggregate.totalDeaths += report.deathCount;
      aggregate.reportCount += 1;
    }

    return Array.from(weeklyMap.values()).sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );
  }

  static async exportWeeklyReportsPdf(
    data: WeeklyReportAggregate[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error) => reject(error));

      doc
        .fontSize(18)
        .text("Weekly Disease Report Summary", { align: "center" });
      doc.moveDown();
      doc.fontSize(11).text(`Generated at: ${new Date().toISOString()}`);
      doc.moveDown();

      if (data.length === 0) {
        doc.text("No report data available.");
        doc.end();
        return;
      }

      for (const row of data) {
        doc
          .fontSize(11)
          .text(
            `Week ${row.weekStart} to ${row.weekEnd} | Cases: ${row.totalCases} | Deaths: ${row.totalDeaths} | Reports: ${row.reportCount}`,
          );
      }

      doc.end();
    });
  }

  static async exportWeeklyReportsExcel(
    data: WeeklyReportAggregate[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Weekly Reports");

    worksheet.columns = [
      { header: "Week Start", key: "weekStart", width: 15 },
      { header: "Week End", key: "weekEnd", width: 15 },
      { header: "Total Cases", key: "totalCases", width: 14 },
      { header: "Total Deaths", key: "totalDeaths", width: 14 },
      { header: "Report Count", key: "reportCount", width: 14 },
    ];

    for (const row of data) {
      worksheet.addRow(row);
    }

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static async getAllReports() {
    return prisma.diseaseReport.findMany({
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            role: true,
            // BR-01: email omitted from list output to avoid PII exposure
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    });
  }

  static async createReport(data: {
    district?: string;
    diseaseType?: string;
    reporterId?: string;
    caseCount?: number;
    deathCount?: number;
    isOfflineCached?: boolean;
    status?: ReportStatus;
    notes?: string;
    user: { id: string; role: Role };
  }) {
    const {
      district,
      diseaseType,
      reporterId,
      caseCount,
      deathCount,
      isOfflineCached,
      status,
      notes,
      user,
    } = data;

    // BR-01: validate and sanitize input (strips PII from notes, validates counts)
    const sanitized = validateAndSanitizeReport({ district, diseaseType, caseCount, deathCount, notes, isOfflineCached });

    const effectiveReporterId =
      user.role === Role.HEW ? user.id : reporterId;

    if (!effectiveReporterId) {
      throw new AppError("reporterId is required", 400);
    }

    let report;
    try {
      report = await prisma.diseaseReport.create({
        data: {
          district: sanitized.district,
          diseaseType: sanitized.diseaseType,
          reporterId: effectiveReporterId,
          caseCount: sanitized.caseCount,
          deathCount: sanitized.deathCount,
          isOfflineCached: sanitized.isOfflineCached,
          status: status ?? ReportStatus.PENDING,
          isMortalityPriority: sanitized.deathCount > 0,
          notes: sanitized.notes,
        },
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new AppError(
          "A report already exists for this district, disease, reporter, and date",
          409,
        );
      }
      throw error;
    }

    AIService.enqueueZScoreAnomalyTrigger(report.id);

    // BR-03: fire-and-forget mortality threshold check
    setImmediate(async () => {
      try {
        await AlertService.checkAndCreateCriticalMortalityAlert(
          report.diseaseType,
          report.district,
        );
      } catch (err) {
        logger.error("BR-03 mortality threshold check failed", {
          reportId: report.id,
          err,
        });
      }
    });

    return report;
  }
}
