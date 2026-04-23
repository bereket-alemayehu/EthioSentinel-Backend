import { prisma } from "../lib/prisma";
import {
  AdvisoryStatus,
  Language,
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

type SymptomCheckerInput = {
  symptoms?: string[];
  language?: string;
  location?: string;
};

type SymptomCheckerResult = {
  selectedSymptoms: string[];
  probableDisease: string;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  advice: string;
  disclaimer: string;
  language: SupportedLanguage;
};

export class AdvisoryService {
  private static parseEnumValue<T extends string>(
    value: unknown,
    enumObject: Record<string, T>,
    field: string,
  ): T | undefined {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const normalized = String(value).trim().toUpperCase();
    const allowedValues = Object.values(enumObject);
    if (!allowedValues.includes(normalized as T)) {
      throw new AppError(`${field} must be one of: ${allowedValues.join(", ")}`, 400);
    }
    return normalized as T;
  }

  static checkSymptoms(data: SymptomCheckerInput): SymptomCheckerResult {
    const symptomsRaw = Array.isArray(data.symptoms) ? data.symptoms : [];
    const selectedSymptoms = symptomsRaw
      .map((item) => String(item).trim().toLowerCase())
      .filter((item) => item.length > 0);

    if (selectedSymptoms.length === 0) {
      throw new AppError("At least one symptom is required", 400);
    }

    const languageRaw = String(data.language ?? "ENGLISH")
      .trim()
      .toUpperCase();
    if (
      ![Language.ENGLISH, Language.AMHARIC].includes(
        languageRaw as SupportedLanguage,
      )
    ) {
      throw new AppError("language must be ENGLISH or AMHARIC", 400);
    }

    const language = languageRaw as SupportedLanguage;
    const location = String(data.location ?? "your area").trim() || "your area";

    const hasFever = selectedSymptoms.includes("fever");
    const hasCough = selectedSymptoms.includes("cough");
    const hasDiarrhea = selectedSymptoms.includes("diarrhea");
    const hasVomiting = selectedSymptoms.includes("vomiting");
    const hasHeadache = selectedSymptoms.includes("headache");
    const hasBodyPain = selectedSymptoms.includes("body pain");

    let probableDisease = "General febrile illness";
    let riskLevel: "LOW" | "MODERATE" | "HIGH" = "LOW";

    if ((hasFever && hasDiarrhea) || (hasVomiting && hasDiarrhea)) {
      probableDisease = "Cholera-like illness";
      riskLevel = "HIGH";
    } else if (hasFever && hasHeadache && hasBodyPain) {
      probableDisease = "Malaria-like illness";
      riskLevel = "MODERATE";
    } else if (hasFever && hasCough) {
      probableDisease = "Respiratory infection";
      riskLevel = "MODERATE";
    }

    const adviceEn =
      riskLevel === "HIGH"
        ? `High risk signs detected for ${location}. Seek immediate care at the nearest health facility and avoid dehydration.`
        : riskLevel === "MODERATE"
          ? `Moderate risk signs detected for ${location}. Visit a health center soon for clinical assessment.`
          : `Low risk signs detected for ${location}. Rest, hydrate, and monitor symptoms. Seek care if symptoms worsen.`;

    const disclaimerEn =
      "This symptom checker is for guidance only and is not a medical diagnosis. Please consult a healthcare professional.";

    if (language === "AMHARIC") {
      return {
        selectedSymptoms,
        probableDisease: `[AMHARIC PLACEHOLDER] ${probableDisease}`,
        riskLevel,
        advice: `[AMHARIC PLACEHOLDER] ${adviceEn}`,
        disclaimer: `[AMHARIC PLACEHOLDER] ${disclaimerEn}`,
        language,
      };
    }

    return {
      selectedSymptoms,
      probableDisease,
      riskLevel,
      advice: adviceEn,
      disclaimer: disclaimerEn,
      language,
    };
  }

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
      where: {
        status: AdvisoryStatus.APPROVED,
      },
      include: {
        region: true,
        district: true,
        approvedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async getAdvisoryDrafts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [drafts, total] = await Promise.all([
      prisma.advisory.findMany({
        where: { status: AdvisoryStatus.DRAFT },
        include: {
          region: true,
          district: true,
          sourceReport: {
            select: { id: true, diseaseType: true, district: true, timestamp: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.advisory.count({ where: { status: AdvisoryStatus.DRAFT } }),
    ]);

    return {
      data: drafts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async rejectAdvisory(advisoryId: string) {
    if (!advisoryId) {
      throw new AppError("Invalid advisory id", 400);
    }

    return prisma.advisory.update({
      where: { id: advisoryId },
      data: { status: AdvisoryStatus.REJECTED },
    });
  }

  static async createAdvisory(data: {
    diseaseType?: string;
    regionId?: number;
    districtId?: number;
    sourceReportId?: string;
    approvedById?: string;
    title?: string;
    content?: string;
    language?: string;
    status?: AdvisoryStatus;
    riskLevel?: string;
    generatedByAI?: boolean;
  }) {
    const {
      diseaseType,
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

    if (!diseaseType || !regionId || !title || !content) {
      throw new AppError(
        "diseaseType, regionId, title and content are required",
        400,
      );
    }

    const parsedStatus =
      this.parseEnumValue(status, AdvisoryStatus, "status") ??
      AdvisoryStatus.DRAFT;

    return prisma.advisory.create({
      data: {
        diseaseType,
        regionId,
        districtId,
        sourceReportId,
        approvedById,
        title,
        content,
        language: language ?? "AMHARIC",
        status: parsedStatus,
        riskLevel: riskLevel ?? "MODERATE",
        generatedByAI: generatedByAI ?? true,
        approvedAt:
          parsedStatus === AdvisoryStatus.APPROVED ? new Date() : undefined,
      },
      include: {
        region: true,
        district: true,
      },
    });
  }

  static async approveAdvisory(advisoryId: string, userId: string) {
    if (!advisoryId) {
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
