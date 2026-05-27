import { prisma } from "../lib/prisma";
import {
  AdvisoryStatus,
  Language,
} from "@prisma/client";
import { AppError } from "../utils/AppError";
import { AuditService } from "./audit.service";
import {
  buildCitizenSmsAlert,
  enrichCitizenAdvisoryContent,
  sanitizePublicHealthText,
} from "../utils/healthMessaging";
import { EmailSender } from "../utils/EmailSender";
import { SmsSender } from "../utils/SmsSender";
import Logger from "../utils/logger";

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
  private static async notifyCitizensOnAdvisoryApproval(input: {
    advisoryId: string;
    diseaseType: string;
    title: string;
    content: string;
    riskLevel: string;
    districtName: string | null;
    regionName: string;
  }) {
    const targetLocation = input.districtName ?? input.regionName;
    const where = input.districtName
      ? {
          role: "CITIZEN" as const,
          isActive: true,
          OR: [
            {
              assignedDistrict: {
                equals: input.districtName,
                mode: "insensitive" as const,
              },
            },
            // Fallback to region if district not set
            {
              AND: [
                {
                  assignedDistrict: null,
                },
                {
                  region: {
                    equals: input.regionName,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          ],
        }
      : {
          role: "CITIZEN" as const,
          isActive: true,
          region: {
            equals: input.regionName,
            mode: "insensitive" as const,
          },
        };

    const citizens = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        phoneNumber: true,
      },
    });

    if (citizens.length === 0) {
      Logger.info("No citizens found for approved advisory notification", {
        advisoryId: input.advisoryId,
        location: targetLocation,
        queryDistrict: input.districtName,
        queryRegion: input.regionName,
      });
      return { emailDelivered: 0, emailFailed: 0, smsDelivered: 0, smsFailed: 0 };
    }

    const emailRecipients = citizens
      .map((citizen) => citizen.email?.trim())
      .filter((email): email is string => Boolean(email));

    const smsRecipients = citizens
      .filter((citizen) => !citizen.email && citizen.phoneNumber)
      .map((citizen) => citizen.phoneNumber as string);

    const advisoryBody = sanitizePublicHealthText(input.content) || input.content;

    const emailResult =
      emailRecipients.length > 0
        ? await EmailSender.sendBulkAlertApprovalEmails(emailRecipients, {
            disease: input.diseaseType,
            location: targetLocation,
            advisory: advisoryBody,
            severity: input.riskLevel,
            alertTitle: input.title,
          })
        : { attempted: 0, delivered: 0, failed: 0 };

    const smsResult =
      smsRecipients.length > 0
        ? await SmsSender.sendBulkSms(
            smsRecipients,
            buildCitizenSmsAlert(input.diseaseType, targetLocation),
          )
        : { delivered: 0, failed: 0 };

    Logger.info("Approved advisory citizen notification dispatched", {
      advisoryId: input.advisoryId,
      location: targetLocation,
      citizensMatched: citizens.length,
      emailRecipientsCount: emailRecipients.length,
      smsRecipientsCount: smsRecipients.length,
      emailAttempted: emailResult.attempted,
      emailDelivered: emailResult.delivered,
      emailFailed: emailResult.failed,
      smsDelivered: smsResult.delivered,
      smsFailed: smsResult.failed,
    });

    return {
      emailDelivered: emailResult.delivered,
      emailFailed: emailResult.failed,
      smsDelivered: smsResult.delivered,
      smsFailed: smsResult.failed,
    };
  }

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
      const probableDiseaseAm =
        probableDisease === "Cholera-like illness"
          ? "የኮሌራ ዓይነት ህመም"
          : probableDisease === "Malaria-like illness"
            ? "የወባ ዓይነት ህመም"
            : probableDisease === "Respiratory infection"
              ? "የመተንፈሻ አካል ኢንፌክሽን"
              : "አጠቃላይ ትኩሳት ያለው ህመም";
      const adviceAm =
        riskLevel === "HIGH"
          ? `${location} ለሚመለከት ከፍተኛ አደጋ ምልክቶች ተገኝተዋል። በቅርብ ያለ የጤና ተቋም አስቸኳይ ሕክምና ይፈልጉ፣ የውሃ እጥረትንም ይከላከሉ።`
          : riskLevel === "MODERATE"
            ? `${location} ለሚመለከት መጠነኛ አደጋ ምልክቶች ተገኝተዋል። በቅርብ ጊዜ ወደ ጤና ማዕከል በመሄድ ምርመራ ያድርጉ።`
            : `${location} ለሚመለከት ዝቅተኛ አደጋ ምልክቶች ተገኝተዋል። ዕረፍት ያድርጉ፣ በቂ ውሃ ይጠጡ፣ ምልክቶችን ይከታተሉ። ከባድ ከሆነ ወደ ሕክምና ይሂዱ።`;
      const disclaimerAm =
        "ይህ የምልክት ምርመራ ለመመሪያ ብቻ ነው፤ የሕክምና ምርመራ አይደለም። እባክዎ የጤና ባለሙያን ያማክሩ።";
      return {
        selectedSymptoms,
        probableDisease: probableDiseaseAm,
        riskLevel,
        advice: adviceAm,
        disclaimer: disclaimerAm,
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
      const amharicSymptoms = [
        `${diseaseName} የሚያመለክቱ ምልክቶች ትኩሳት፣ ድካም እና የሰውነት ድክመት ሊሆኑ ይችላሉ።`,
        `በ${location} እንደ ታካሚ ሁኔታ ሳል፣ ተቅማጥ ወይም ማስመለስ ያሉ ምልክቶችን ይከታተሉ።`,
        `ምልክቶች ከባድ ወይም ቀጣይ ከሆኑ ፈጣን የሕክምና እርዳታ ይፈልጉ።`,
      ];
      const amharicPrevention = [
        `በ${location} በሳሙና እና በንጹህ ውሃ እጅዎን ደጋግመው ይታጠቡ።`,
        `ከተጠረጠሩ ${diseaseName} ታካሚዎች ጋር ቅርብ ግንኙነትን ይቀንሱ፣ የቤት አየር እንዲለዋወጥ ያድርጉ።`,
        "የአካባቢዎን የጤና ቢሮ ማስታወቂያዎች ይከተሉ እና የተጠረጠሩ ጉዳዮችን በፍጥነት ያሳውቁ።",
      ];
      const amharicTreatment: Record<string, string[]> = {
        LOW: [
          "በቤት ውስጥ ዕረፍት ያድርጉ፣ በቂ ፈሳሽ ይውሰዱ፣ በቅርብ ያለ ጤና ተቋም ቀድሞ ያማክሩ።",
          "መድሃኒት የጤና ሰራተኛ ምክር መሠረት ብቻ ይጠቀሙ።",
        ],
        MODERATE: [
          "ለክሊኒካዊ ምርመራ እና ድጋፍ ሕክምና ወደ ጤና ማዕከል ይሂዱ።",
          "ምልክት ያላቸውን ሰዎች እስኪፈቀድ ድረስ በቤት ውስጥ ከሌሎች ይለዩ።",
        ],
        HIGH: [
          "ፈጣን የሕክምና ግምገማ በወረዳ ሆስፒታል ይካሄድ።",
          "ከፍተኛ ተጋላጭነት ያላቸውን ቡድኖች (ህጻናት፣ አረጋውያን፣ ህመም ያላቸው) ቅድሚያ ይስጡ።",
        ],
        CRITICAL: [
          "አስቸኳይ ህክምና ወዲያውኑ ይፈልጉ እና የአካባቢውን ፈጣን ምላሽ ያስነሱ።",
          "በቁጥጥር ስር የተደረገ ሪፈራል እና ጥብቅ የኢንፌክሽን መከላከል ሂደቶችን ይተግብሩ።",
        ],
      };
      return {
        diseaseName,
        severity: normalizedSeverity,
        location,
        language,
        symptoms: amharicSymptoms,
        preventionSteps: amharicPrevention,
        treatmentAdvice: amharicTreatment[normalizedSeverity as keyof typeof amharicTreatment],
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


  private static withPublicAdvisoryContent<T extends { content: string; diseaseType: string; riskLevel: string; district?: { name: string } | null }>(
    row: T,
  ): T & { publicContent: string } {
    return {
      ...row,
      publicContent: enrichCitizenAdvisoryContent(row.content, {
        diseaseType: row.diseaseType,
        district: row.district?.name ?? "your area",
        riskLevel: row.riskLevel,
      }),
    };
  }

  static async getAllAdvisories() {
    const rows = await prisma.advisory.findMany({
      where: {
        status: AdvisoryStatus.APPROVED,
      },
      select: {
        id: true,
        title: true,
        content: true,
        diseaseType: true,
        riskLevel: true,
        language: true,
        status: true,
        regionId: true,
        districtId: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
        region: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        district: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
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
    return rows.map((row) => this.withPublicAdvisoryContent(row));
  }

  static async getAdvisoryById(advisoryId: string) {
    if (!advisoryId) {
      throw new AppError("Invalid advisory id", 400);
    }

    const advisory = await prisma.advisory.findUnique({
      where: { id: advisoryId },
      include: {
        region: true,
        district: true,
        sourceReport: {
          select: { id: true, diseaseType: true, district: true, timestamp: true },
        },
        approvedBy: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    if (!advisory) {
      throw new AppError("Advisory not found", 404);
    }

    return advisory;
  }

  static async getAdvisoriesByDisease(diseaseId: string) {
    const disease = await prisma.disease.findUnique({
      where: { id: Number(diseaseId) },
      select: { name: true },
    });

    if (!disease) {
      throw new AppError("Disease not found", 404);
    }

    return prisma.advisory.findMany({
      where: {
        diseaseType: { equals: disease.name, mode: "insensitive" },
        status: AdvisoryStatus.APPROVED,
      },
      select: {
        id: true,
        title: true,
        content: true,
        diseaseType: true,
        riskLevel: true,
        language: true,
        status: true,
        createdAt: true,
        region: { select: { id: true, name: true, code: true } },
        district: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getAdvisoriesByStatus(status: AdvisoryStatus, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [advisories, total] = await Promise.all([
      prisma.advisory.findMany({
        where: { status },
        select: {
          id: true,
          title: true,
          content: true,
          diseaseType: true,
          riskLevel: true,
          language: true,
          status: true,
          regionId: true,
          districtId: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          region: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          district: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          sourceReport: {
            select: { id: true, diseaseType: true, district: true, timestamp: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.advisory.count({ where: { status } }),
    ]);

    return {
      data: advisories,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async rejectAdvisory(advisoryId: string, actorUserId: string) {
    if (!advisoryId) {
      throw new AppError("Invalid advisory id", 400);
    }

    const row = await prisma.advisory.update({
      where: { id: advisoryId },
      data: { status: AdvisoryStatus.REJECTED },
    });

    await AuditService.append({
      action: "ADVISORY_REJECTED",
      actorUserId,
      resourceType: "Advisory",
      resourceId: advisoryId,
    });

    return row;
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

    const row = await prisma.advisory.update({
      where: { id: advisoryId },
      data: {
        status: AdvisoryStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: userId,
      },
      include: {
        region: { select: { name: true } },
        district: { select: { name: true } },
      },
    });

    await AuditService.append({
      action: "ADVISORY_APPROVED",
      actorUserId: userId,
      resourceType: "Advisory",
      resourceId: advisoryId,
    });

    await this.notifyCitizensOnAdvisoryApproval({
      advisoryId: row.id,
      diseaseType: row.diseaseType,
      title: row.title,
      content: row.content,
      riskLevel: row.riskLevel,
      districtName: row.district?.name ?? null,
      regionName: row.region.name,
    });

    return row;
  }

  static async withdrawAdvisory(advisoryId: string, actorUserId: string) {
    if (!advisoryId) {
      throw new AppError("Invalid advisory id", 400);
    }

    const row = await prisma.advisory.update({
      where: { id: advisoryId },
      data: {
        status: AdvisoryStatus.DRAFT,
        approvedAt: null,
        approvedById: null,
      },
    });

    await AuditService.append({
      action: "ADVISORY_WITHDRAWN",
      actorUserId,
      resourceType: "Advisory",
      resourceId: advisoryId,
    });

    return row;
  }
}
