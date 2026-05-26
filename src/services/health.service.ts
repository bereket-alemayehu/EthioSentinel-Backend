import { prisma } from "../lib/prisma";

export class HealthService {
  static async checkHealth() {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "EthioHealthSentinel API",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  }

  static async getHealthFacilities() {
    return prisma.healthFacility.findMany({
      where: {
        AND: [
          { Y: { not: null } },
          { X: { not: null } },
        ],
      },
      select: {
        id: true,
        HF_Name: true,
        HF_Type: true,
        Region: true,
        Zone: true,
        Woreda: true,
        Y: true,
        X: true,
        regionId: true,
        districtId: true,
        Status: true,
      },
      orderBy: { HF_Name: "asc" },
    });
  }

  static async getHealthFacilitiesWithDiseaseIndicators(days = 30) {
    const facilities = await prisma.healthFacility.findMany({
      where: {
        AND: [
          { Y: { not: null } },
          { X: { not: null } },
        ],
      },
      select: {
        id: true,
        HF_Name: true,
        HF_Type: true,
        Region: true,
        Zone: true,
        Woreda: true,
        Y: true,
        X: true,
        regionId: true,
        districtId: true,
        Status: true,
      },
      orderBy: { HF_Name: "asc" },
    });

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const facilitiesWithIndicators = await Promise.all(
      facilities.map(async (facility) => {
        const reports = await prisma.diseaseReport.findMany({
          where: {
            district: facility.Woreda || undefined,
            createdAt: { gte: dateFrom },
          },
          select: {
            diseaseType: true,
            caseCount: true,
            deathCount: true,
          },
        });

        const diseaseMap = new Map<
          string,
          { cases: number; deaths: number; reports: number }
        >();
        for (const report of reports) {
          const existing = diseaseMap.get(report.diseaseType) || {
            cases: 0,
            deaths: 0,
            reports: 0,
          };
          diseaseMap.set(report.diseaseType, {
            cases: existing.cases + (report.caseCount || 0),
            deaths: existing.deaths + (report.deathCount || 0),
            reports: existing.reports + 1,
          });
        }

        const totalCases = Array.from(diseaseMap.values()).reduce(
          (sum, d) => sum + d.cases,
          0,
        );
        const totalDeaths = Array.from(diseaseMap.values()).reduce(
          (sum, d) => sum + d.deaths,
          0,
        );

        let riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
        if (totalCases === 0) {
          riskLevel = "LOW";
        } else if (totalCases < 5) {
          riskLevel = "LOW";
        } else if (totalCases < 20) {
          riskLevel = "MODERATE";
        } else if (totalCases < 50) {
          riskLevel = "HIGH";
        } else {
          riskLevel = "CRITICAL";
        }

        const topDiseases = Array.from(diseaseMap.entries())
          .map(([diseaseType, data]) => ({
            diseaseType,
            cases: data.cases,
            reports: data.reports,
          }))
          .sort((a, b) => b.cases - a.cases)
          .slice(0, 3);

        return {
          ...facility,
          totalCases,
          totalDeaths,
          totalReports: reports.length,
          riskLevel,
          topDiseases,
        };
      }),
    );

    return facilitiesWithIndicators;
  }
}
