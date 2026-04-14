import { prisma } from "../lib/prisma";
import {
  ReportSource,
  ReportStatus,
  UserRole,
} from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

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
        reportDate: true,
        caseCount: true,
        deathCount: true,
      },
      orderBy: {
        reportDate: "asc",
      },
    });

    const weeklyMap = new Map<string, WeeklyReportAggregate>();

    for (const report of reports) {
      const weekStartDate = this.getWeekStartUTC(report.reportDate);
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
        disease: true,
        district: true,
        reporter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        reportDate: "desc",
      },
    });
  }

  static async createReport(data: {
    districtId?: number;
    diseaseId?: number;
    reporterId?: number;
    reportDate?: string;
    caseCount?: number;
    deathCount?: number;
    source?: ReportSource;
    status?: ReportStatus;
    notes?: string;
    user: { id: number; role: UserRole };
  }) {
    const {
      districtId,
      diseaseId,
      reporterId,
      reportDate,
      caseCount,
      deathCount,
      source,
      status,
      notes,
      user,
    } = data;

    if (!districtId || !diseaseId || !reportDate) {
      throw new AppError(
        "districtId, diseaseId and reportDate are required",
        400,
      );
    }

    const effectiveReporterId =
      user.role === UserRole.HEW ? user.id : reporterId;

    if (!effectiveReporterId) {
      throw new AppError("reporterId is required", 400);
    }

    return prisma.diseaseReport.create({
      data: {
        districtId,
        diseaseId,
        reporterId: effectiveReporterId,
        reportDate: new Date(reportDate),
        caseCount: caseCount ?? 0,
        deathCount: deathCount ?? 0,
        source: source ?? ReportSource.PWA_ONLINE,
        status: status ?? ReportStatus.PENDING,
        isMortalityPriority: (deathCount ?? 0) > 0,
        notes,
      },
      include: {
        disease: true,
        district: true,
      },
    });
  }
}
