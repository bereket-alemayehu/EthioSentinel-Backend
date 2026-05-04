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

type AnomalyFilters = {
  startDate?: string;
  endDate?: string;
  district?: string;
  diseaseType?: string;
  classification?: "ANOMALY" | "NORMAL";
  page?: number;
  limit?: number;
};

type TimeseriesFilters = {
  district: string;
  diseaseType: string;
  days?: number;
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

  static async exportAggregatedCsv(result: AnalyticsResult): Promise<Buffer> {
    const headers = [
      "District",
      "Disease Type",
      "Total Cases",
      "Total Deaths",
      "Report Count",
      "Mortality Rate",
    ];
    const escapeCell = (value: string | number) => {
      const str = String(value ?? "");
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const lines: string[] = [headers.join(",")];
    for (const row of result.data) {
      lines.push(
        [
          row.district,
          row.diseaseType,
          row.totalCases,
          row.totalDeaths,
          row.reportCount,
          row.mortalityRate,
        ]
          .map(escapeCell)
          .join(","),
      );
    }
    return Buffer.from(lines.join("\n") + "\n", "utf8");
  }

  static async getAnomalySignals(filters: AnomalyFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const dateFilter = this.buildDateFilter(filters.startDate, filters.endDate);

    const where = {
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      ...(filters.district
        ? { district: { contains: filters.district, mode: "insensitive" as const } }
        : {}),
      ...(filters.diseaseType
        ? {
            diseaseType: {
              contains: filters.diseaseType,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(filters.classification
        ? { classification: filters.classification }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.anomalySignal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.anomalySignal.count({ where }),
    ]);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async exportAnomaliesCsv(rows: Array<{
    createdAt: Date;
    district: string;
    diseaseType: string;
    currentCases: number;
    historicalMean: number;
    stdDev: number;
    zScore: number | null;
    classification: string;
    method: string;
    sampleSize: number;
    manual: boolean;
  }>): Promise<Buffer> {
    const headers = [
      "Detected At",
      "District",
      "Disease Type",
      "Current Cases",
      "Historical Mean",
      "Std Dev",
      "Z-Score",
      "Classification",
      "Method",
      "Sample Size",
      "Manual",
    ];
    const escapeCell = (value: string | number | null | undefined) => {
      const str = String(value ?? "");
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const lines: string[] = [headers.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.createdAt.toISOString(),
          row.district,
          row.diseaseType,
          row.currentCases,
          row.historicalMean,
          row.stdDev,
          row.zScore ?? "",
          row.classification,
          row.method,
          row.sampleSize,
          row.manual ? "yes" : "no",
        ]
          .map(escapeCell)
          .join(","),
      );
    }
    return Buffer.from(lines.join("\n") + "\n", "utf8");
  }

  static async getAnomalyTimeseries(filters: TimeseriesFilters) {
    const days = Math.max(1, Math.min(180, filters.days ?? 30));
    const lookbackEnd = new Date();
    const lookbackStart = new Date(lookbackEnd);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - days);

    const reports = await prisma.diseaseReport.findMany({
      where: {
        district: { equals: filters.district, mode: "insensitive" },
        diseaseType: { equals: filters.diseaseType, mode: "insensitive" },
        timestamp: { gte: lookbackStart, lte: lookbackEnd },
      },
      select: { timestamp: true, caseCount: true, deathCount: true },
      orderBy: { timestamp: "asc" },
    });

    // Bucket by day (UTC)
    const dailyMap = new Map<
      string,
      { date: string; cases: number; deaths: number; reports: number }
    >();
    for (const r of reports) {
      const dayKey = r.timestamp.toISOString().slice(0, 10);
      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { date: dayKey, cases: 0, deaths: 0, reports: 0 });
      }
      const bucket = dailyMap.get(dayKey)!;
      bucket.cases += r.caseCount;
      bucket.deaths += r.deathCount;
      bucket.reports += 1;
    }

    const dailySeries = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Compute mean/stdDev across all daily buckets
    const values = dailySeries.map((d) => d.cases);
    let mean = 0;
    let stdDev = 0;
    if (values.length > 0) {
      mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance =
        values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      stdDev = Math.sqrt(variance);
    }

    const series = dailySeries.map((d) => ({
      ...d,
      zScore: stdDev > 0 ? Number(((d.cases - mean) / stdDev).toFixed(4)) : 0,
      isAnomaly: stdDev > 0 && (d.cases - mean) / stdDev > 2,
    }));

    // Recent persisted signals for this combo
    const signals = await prisma.anomalySignal.findMany({
      where: {
        district: { equals: filters.district, mode: "insensitive" },
        diseaseType: { equals: filters.diseaseType, mode: "insensitive" },
        createdAt: { gte: lookbackStart, lte: lookbackEnd },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      district: filters.district,
      diseaseType: filters.diseaseType,
      windowDays: days,
      lookbackStart: lookbackStart.toISOString(),
      lookbackEnd: lookbackEnd.toISOString(),
      summary: {
        mean: Number(mean.toFixed(4)),
        stdDev: Number(stdDev.toFixed(4)),
        threshold2Sigma: Number((mean + 2 * stdDev).toFixed(4)),
        threshold3Sigma: Number((mean + 3 * stdDev).toFixed(4)),
        sampleSize: values.length,
        latestZScore: series.length > 0 ? series[series.length - 1].zScore : 0,
      },
      series,
      signals,
    };
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
