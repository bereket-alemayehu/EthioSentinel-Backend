import { prisma } from "../lib/prisma";
import {
  AdvisoryStatus,
  Language,
  RiskLevel,
} from "../../generated/prisma/enums";
import { AppError } from "../utils/AppError";

type SupportedLanguage = "ENGLISH" | "AMHARIC";

type AdvisoryGenerationInput = {
  diseaseName?: string;
  severity?: string;
  location?: string;
  language?: string;
};

type AdvisoryGenerationResult = {
  diseaseName: string;
  severity: string;
  location: string;
  language: SupportedLanguage;
  symptoms: string[];
  preventionSteps: string[];
  treatmentAdvice: string[];
};

export class AdvisoryService {
  static generateHealthAdvisoryText(
    data: AdvisoryGenerationInput,
  ): AdvisoryGenerationResult {
    const diseaseName = String(data.diseaseName ?? "").trim();
    const severityRaw = String(data.severity ?? "").trim();
    const location = String(data.location ?? "").trim();
    const languageRaw = String(data.language ?? "ENGLISH")
      .trim()
      .toUpperCase();

    if (!diseaseName || !severityRaw || !location) {
      throw new AppError(
        "disease name, severity and location are required",
        400,
      );
    }

    const normalizedSeverity = severityRaw.toUpperCase();
    const allowedSeverity = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
    if (!allowedSeverity.includes(normalizedSeverity)) {
      throw new AppError(
        "severity must be one of: LOW, MODERATE, HIGH, CRITICAL",
        400,
      );
    }

    if (
      ![Language.ENGLISH, Language.AMHARIC].includes(
        languageRaw as SupportedLanguage,
      )
    ) {
      throw new AppError("language must be ENGLISH or AMHARIC", 400);
    }

    const language = languageRaw as SupportedLanguage;

    const englishSymptoms = [
      `Possible ${diseaseName} symptoms include fever, fatigue, and body weakness.`,
      `In ${location}, monitor for cough, diarrhea, or vomiting depending on case pattern.`,
      `Seek immediate care if symptoms become severe or persistent.`,
    ];

    const englishPreventionSteps = [
      `Wash hands regularly with soap and clean water in ${location}.`,
      `Avoid close contact with suspected ${diseaseName} cases and improve household ventilation.`,
      `Follow local health office updates and report suspected cases early.`,
    ];

    const severityTreatmentMap: Record<string, string[]> = {
      LOW: [
        "Home rest, hydration, and early consultation at nearby health post.",
        "Use medication only as prescribed by health workers.",
      ],
      MODERATE: [
        "Visit a health center for clinical assessment and supportive treatment.",
        "Isolate symptomatic persons at home until cleared by clinicians.",
      ],
      HIGH: [
        "Urgent medical evaluation is recommended at a district hospital.",
        "Prioritize high-risk groups (children, elderly, chronic illness patients).",
      ],
      CRITICAL: [
        "Seek emergency treatment immediately and activate local rapid response.",
        "Arrange supervised referral and strict infection prevention protocols.",
      ],
    };

    const englishTreatmentAdvice = severityTreatmentMap[normalizedSeverity];

    if (language === "AMHARIC") {
      return {
        diseaseName,
        severity: normalizedSeverity,
        location,
        language,
        symptoms: englishSymptoms.map(
          (item) => `[AMHARIC PLACEHOLDER] ${item}`,
        ),
        preventionSteps: englishPreventionSteps.map(
          (item) => `[AMHARIC PLACEHOLDER] ${item}`,
        ),
        treatmentAdvice: englishTreatmentAdvice.map(
          (item) => `[AMHARIC PLACEHOLDER] ${item}`,
        ),
      };
    }

    return {
      diseaseName,
      severity: normalizedSeverity,
      location,
      language,
      symptoms: englishSymptoms,
      preventionSteps: englishPreventionSteps,
      treatmentAdvice: englishTreatmentAdvice,
    };
  }

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
      throw new AppError(
        "diseaseId, regionId, title and content are required",
        400,
      );
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
