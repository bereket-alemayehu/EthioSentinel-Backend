import { prisma } from "../lib/prisma";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

type AnalyticsFilters = {
  startDate?: string;
  endDate?: string;
  district?: string;
  diseaseType?: string;
  page?: number;
  limit?: number;
};

type AggregatedRow = {
  district: string;
  diseaseType: string;
  totalCases: number;
  totalDeaths: number;
  reportCount: number;
  mortalityRate: string;
};

type AnalyticsResult = {
  data: AggregatedRow[];
  filters: Omit<AnalyticsFilters, "page" | "limit">;
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export class AnalyticsService {
  private static buildDateFilter(startDate?: string, endDate?: string) {
    const filter: { gte?: Date; lte?: Date } = {};
    if (startDate) filter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      filter.lte = end;
    }
    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  static async getAggregatedReports(
    filters: AnalyticsFilters,
  ): Promise<AnalyticsResult> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(filters.startDate, filters.endDate);

    const where = {
      ...(dateFilter ? { timestamp: dateFilter } : {}),
      ...(filters.district
        ? { district: { contains: filters.district, mode: "insensitive" as const } }
        : {}),
      ...(filters.diseaseType
        ? { diseaseType: { contains: filters.diseaseType, mode: "insensitive" as const } }
        : {}),
    };

    const [rows, totalCount] = await Promise.all([
      prisma.diseaseReport.groupBy({
        by: ["district", "diseaseType"],
        where,
        _sum: { caseCount: true, deathCount: true },
        _count: { id: true },
        orderBy: { _sum: { caseCount: "desc" } },
        skip,
        take: limit,
      }),
      prisma.diseaseReport.groupBy({
        by: ["district", "diseaseType"],
        where,
        _count: { id: true },
      }).then((r) => r.length),
    ]);

    const data: AggregatedRow[] = rows.map((row) => {
      const cases = row._sum.caseCount ?? 0;
      const deaths = row._sum.deathCount ?? 0;
      const rate = cases > 0 ? ((deaths / cases) * 100).toFixed(1) + "%" : "0%";
      return {
        district: row.district,
        diseaseType: row.diseaseType,
        totalCases: cases,
        totalDeaths: deaths,
        reportCount: row._count.id,
        mortalityRate: rate,
      };
    });

    return {
      data,
      filters: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        district: filters.district,
        diseaseType: filters.diseaseType,
      },
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  static async exportAggregatedPdf(
    result: AnalyticsResult,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(16).text("Disease Report Analytics", { align: "center" });
      doc.moveDown(0.5);

      const { startDate, endDate, district, diseaseType } = result.filters;
      const filterLine = [
        startDate && `From: ${startDate}`,
        endDate && `To: ${endDate}`,
        district && `District: ${district}`,
        diseaseType && `Disease: ${diseaseType}`,
      ]
        .filter(Boolean)
        .join("  |  ");

      if (filterLine) {
        doc.fontSize(10).text(filterLine, { align: "center" });
        doc.moveDown(0.5);
      }

      doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`, { align: "center" });
      doc.moveDown();

      if (result.data.length === 0) {
        doc.fontSize(11).text("No data found for the selected filters.");
        doc.end();
        return;
      }

      const colWidths = [120, 120, 65, 65, 70, 75];
      const headers = ["District", "Disease", "Cases", "Deaths", "Reports", "Mortality"];
      const startX = 40;
      let y = doc.y;

      doc.fontSize(10).font("Helvetica-Bold");
      headers.forEach((h, i) => {
        doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: colWidths[i],
          align: "left",
        });
      });

      doc.moveDown(0.3);
      doc.moveTo(startX, doc.y).lineTo(515, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica");
      for (const row of result.data) {
        y = doc.y;
        const cells = [
          row.district,
          row.diseaseType,
          String(row.totalCases),
          String(row.totalDeaths),
          String(row.reportCount),
          row.mortalityRate,
        ];
        cells.forEach((cell, i) => {
          doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
            width: colWidths[i],
            align: "left",
          });
        });
        doc.moveDown(0.4);
      }

      doc.end();
    });
  }

  static async exportAggregatedExcel(
    result: AnalyticsResult,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EthioSentinel";
    const sheet = workbook.addWorksheet("Analytics");

    sheet.columns = [
      { header: "District", key: "district", width: 20 },
      { header: "Disease Type", key: "diseaseType", width: 20 },
      { header: "Total Cases", key: "totalCases", width: 14 },
      { header: "Total Deaths", key: "totalDeaths", width: 14 },
      { header: "Report Count", key: "reportCount", width: 14 },
      { header: "Mortality Rate", key: "mortalityRate", width: 16 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const row of result.data) {
      sheet.addRow(row);
    }

    const { startDate, endDate, district, diseaseType } = result.filters;
    const metaSheet = workbook.addWorksheet("Filters");
    metaSheet.addRow(["Filter", "Value"]);
    if (startDate) metaSheet.addRow(["Start Date", startDate]);
    if (endDate) metaSheet.addRow(["End Date", endDate]);
    if (district) metaSheet.addRow(["District", district]);
    if (diseaseType) metaSheet.addRow(["Disease Type", diseaseType]);
    metaSheet.addRow(["Generated At", new Date().toISOString()]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static async getGeoAggregatedReports(filters: {
    startDate?: string;
    endDate?: string;
    diseaseType?: string;
  }) {
    const dateFilter = this.buildDateFilter(filters.startDate, filters.endDate);

    const where = {
      ...(dateFilter ? { timestamp: dateFilter } : {}),
      ...(filters.diseaseType
        ? {
            diseaseType: {
              contains: filters.diseaseType,
              mode: "insensitive" as const,
            },
          }
        : {}),
    };

    // Aggregate by district name and diseaseType
    const grouped = await prisma.diseaseReport.groupBy({
      by: ["district", "diseaseType"],
      where,
      _sum: { caseCount: true, deathCount: true },
      _count: { id: true },
    });

    // Fetch district coordinates
    const districtNames = Array.from(new Set(grouped.map((g) => g.district)));
    const districts = await prisma.district.findMany({
      where: {
        name: { in: districtNames },
      },
      select: {
        name: true,
        latitude: true,
        longitude: true,
      },
    });

    const districtMap = new Map(districts.map((d) => [d.name, d]));

    return grouped.map((group) => {
      const geo = districtMap.get(group.district);
      return {
        district: group.district,
        diseaseType: group.diseaseType,
        totalCases: group._sum.caseCount ?? 0,
        totalDeaths: group._sum.deathCount ?? 0,
        reportCount: group._count.id,
        latitude: geo?.latitude ? Number(geo.latitude) : null,
        longitude: geo?.longitude ? Number(geo.longitude) : null,
      };
    });
  }
}
