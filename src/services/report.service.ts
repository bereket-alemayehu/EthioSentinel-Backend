import { prisma } from "../lib/prisma";
import { ReportSource, ReportStatus, UserRole } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export class ReportService {
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
      throw new AppError("districtId, diseaseId and reportDate are required", 400);
    }

    const effectiveReporterId = user.role === UserRole.HEW ? user.id : reporterId;

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
