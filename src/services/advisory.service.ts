import { prisma } from "../lib/prisma";
import { AdvisoryStatus, Language, RiskLevel } from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

export class AdvisoryService {
  static async getAllAdvisories() {
    return prisma.advisory.findMany({
      include: {
        disease: true,
        region: true,
        district: true,
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async createAdvisory(data: {
    diseaseId?: number;
    regionId?: number;
    districtId?: number;
    sourceReportId?: number;
    approvedById?: number;
    title?: string;
    content?: string;
    language?: Language;
    status?: AdvisoryStatus;
    riskLevel?: RiskLevel;
    generatedByAI?: boolean;
  }) {
    const {
      diseaseId,
      regionId,
      districtId,
      sourceReportId,
      approvedById,
      title,
      content,
      language,
      status,
      riskLevel,
      generatedByAI,
    } = data;

    if (!diseaseId || !regionId || !title || !content) {
      throw new AppError("diseaseId, regionId, title and content are required", 400);
    }

    return prisma.advisory.create({
      data: {
        diseaseId,
        regionId,
        districtId,
        sourceReportId,
        approvedById,
        title,
        content,
        language: language ?? Language.AMHARIC,
        status: status ?? AdvisoryStatus.DRAFT,
        riskLevel: riskLevel ?? RiskLevel.MODERATE,
        generatedByAI: generatedByAI ?? true,
        approvedAt: status === AdvisoryStatus.APPROVED ? new Date() : undefined,
      },
    });
  }

  static async approveAdvisory(advisoryId: number, userId: number) {
    if (Number.isNaN(advisoryId)) {
      throw new AppError("Invalid advisory id", 400);
    }

    return prisma.advisory.update({
      where: { id: advisoryId },
      data: {
        status: AdvisoryStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: userId,
      },
    });
  }
}
