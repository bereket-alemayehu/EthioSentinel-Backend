import { prisma } from "../lib/prisma";
import { ReportStatus, Role } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { AuditService } from "./audit.service";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { AIService } from "./ai.service";
import { AlertService } from "./alert.service";
import Logger from "../utils/logger";
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
      doc.on("error", (error: Error) => reject(error));

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

  static async getAllReports(
    filters?: { reporterId?: string },
    page: number = 1,
    limit: number = 10,
  ) {
    const where = filters?.reporterId ? { reporterId: filters.reporterId } : {};
    const skip = (page - 1) * limit;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [reports, total, dailyCount] = await Promise.all([
      prisma.diseaseReport.findMany({
        where,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
          disease: true,
        },
        orderBy: {
          timestamp: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.diseaseReport.count({ where }),
      prisma.diseaseReport.count({
        where: {
          ...where,
          timestamp: {
            gte: todayStart,
          },
        },
      }),
    ]);

    return {
      reports,
      total,
      dailyCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async createReport(data: {
    district?: string;
    diseaseType?: string;
    diseaseId?: number;
    reporterId?: string;
    caseCount?: number;
    deathCount?: number;
    isOfflineCached?: boolean;
    status?: ReportStatus;
    notes?: string;
    date?: string;
    reportDate?: string;
    timestamp?: string;
    user: { id: string; role: Role };
  }) {
    const {
      district,
      diseaseType,
      diseaseId,
      reporterId,
      caseCount,
      deathCount,
      isOfflineCached,
      status,
      notes,
      date,
      reportDate,
      timestamp,
      user,
    } = data;

    // BR-01: validate and sanitize input (strips PII from notes, validates counts)
    const sanitized = validateAndSanitizeReport({
      district,
      diseaseType,
      caseCount,
      deathCount,
      date,
      reportDate,
      timestamp,
      notes,
      isOfflineCached,
    });

    const trimmedReporterId = reporterId?.trim();
    const effectiveReporterId =
      user.role === Role.HEW
        ? user.id
        : trimmedReporterId ||
          (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN
            ? user.id
            : undefined);

    if (!effectiveReporterId) {
      throw new AppError("reporterId is required", 400);
    }

    let report;
    try {
      report = await prisma.diseaseReport.create({
        data: {
          district: sanitized.district,
          diseaseType: sanitized.diseaseType,
          diseaseId: diseaseId || sanitized.diseaseId,
          reporterId: effectiveReporterId,
          caseCount: sanitized.caseCount,
          deathCount: sanitized.deathCount,
          isOfflineCached: sanitized.isOfflineCached,
          status: status ?? ReportStatus.PENDING,
          isMortalityPriority: sanitized.deathCount > 0,
          timestamp: sanitized.timestamp,
          notes: sanitized.notes,
        },
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              email: true,
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

    await AuditService.append({
      action: "REPORT_SUBMITTED",
      actorUserId: effectiveReporterId,
      actorEmail: report.reporter.email,
      resourceType: "DiseaseReport",
      resourceId: report.id,
      metadata: {
        summary: `${report.reporter.username} (${report.reporter.role}) filed ${sanitized.diseaseType} in ${sanitized.district}: ${sanitized.caseCount} cases, ${sanitized.deathCount} deaths`,
        district: sanitized.district,
        diseaseType: sanitized.diseaseType,
        reporterRole: report.reporter.role,
        caseCount: sanitized.caseCount,
        deathCount: sanitized.deathCount,
      },
    });

    // BR-03: fire-and-forget mortality threshold check
    setImmediate(async () => {
      try {
        await AlertService.checkAndCreateCriticalMortalityAlert(
          report.diseaseType,
          report.district,
        );
      } catch (err) {
        Logger.error("BR-03 mortality threshold check failed", {
          reportId: report.id,
          err,
        });
      }
    });

    return report;
  }

  static async updateReport(
    id: string,
    data: {
      district?: string;
      diseaseType?: string;
      diseaseId?: number;
      caseCount?: number;
      deathCount?: number;
      notes?: string;
      date?: string;
      reportDate?: string;
      timestamp?: string;
      userId: string;
      userRole: Role;
      userEmail: string;
    },
  ) {
    const report = await prisma.diseaseReport.findUnique({
      where: { id },
    });

    if (!report) throw new AppError("Report not found", 404);

    const elevated =
      data.userRole === Role.ADMIN || data.userRole === Role.SUPER_ADMIN;
    if (report.reporterId !== data.userId && !elevated) {
      throw new AppError("Unauthorized to update this report", 403);
    }

    const sanitized = validateAndSanitizeReport({
      district: data.district,
      diseaseType: data.diseaseType,
      caseCount: data.caseCount,
      deathCount: data.deathCount,
      date: data.date,
      reportDate: data.reportDate,
      timestamp: data.timestamp,
      notes: data.notes,
    });

    const before = {
      district: report.district,
      diseaseType: report.diseaseType,
      caseCount: report.caseCount,
      deathCount: report.deathCount,
      reporterId: report.reporterId,
    };

    const updated = await prisma.diseaseReport.update({
      where: { id },
      data: {
        district: sanitized.district,
        diseaseType: sanitized.diseaseType,
        diseaseId: data.diseaseId,
        caseCount: sanitized.caseCount,
        deathCount: sanitized.deathCount,
        timestamp: sanitized.timestamp,
        notes: sanitized.notes,
        isMortalityPriority: sanitized.deathCount > 0,
      },
    });

    await AuditService.append({
      action: "REPORT_UPDATED",
      actorUserId: data.userId,
      actorEmail: data.userEmail,
      resourceType: "DiseaseReport",
      resourceId: id,
      metadata: {
        summary: `${data.userRole} updated report ${id} (${report.district} · ${report.diseaseType})`,
        before,
        after: {
          district: updated.district,
          diseaseType: updated.diseaseType,
          caseCount: updated.caseCount,
          deathCount: updated.deathCount,
        },
        actingAsReporter: report.reporterId !== data.userId,
      },
    });

    return updated;
  }

  static async deleteReport(
    id: string,
    userId: string,
    userRole: Role,
    userEmail: string | null,
  ) {
    const report = await prisma.diseaseReport.findUnique({
      where: { id },
    });

    if (!report) throw new AppError("Report not found", 404);

    const elevated = userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;
    if (report.reporterId !== userId && !elevated) {
      throw new AppError("Unauthorized to delete this report", 403);
    }

    await AuditService.append({
      action: "REPORT_DELETED",
      actorUserId: userId,
      actorEmail: userEmail,
      resourceType: "DiseaseReport",
      resourceId: id,
      metadata: {
        summary: `${userRole} deleted report ${id} (${report.district} · ${report.diseaseType}, cases ${report.caseCount}, deaths ${report.deathCount})`,
        district: report.district,
        diseaseType: report.diseaseType,
        caseCount: report.caseCount,
        deathCount: report.deathCount,
        reporterId: report.reporterId,
        actingAsReporter: report.reporterId !== userId,
      },
    });

    return prisma.diseaseReport.delete({
      where: { id },
    });
  }
}
