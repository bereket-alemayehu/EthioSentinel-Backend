import { prisma } from "../lib/prisma";
import { env } from "../config/env.config";
import { AppError } from "../utils/AppError";
import Logger from "../utils/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

type AppLanguage = "ENGLISH" | "AMHARIC";

type ChatRole = "USER" | "ASSISTANT";

type PersistedChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  language: AppLanguage;
  createdAt: Date;
};

type UserDiseaseContext = {
  userRegion: string | null;
  userDistrict: string | null;
  areaScope: "DISTRICT" | "REGION" | "UNKNOWN";
  districtsInScope: string[];
  topDiseases: Array<{
    diseaseType: string;
    totalCases: number;
    totalDeaths: number;
    reports: number;
  }>;
  recentAnomalies: Array<{
    district: string;
    diseaseType: string;
    zScore: number | null;
    currentCases: number;
    historicalMean: number;
    stdDev: number;
    classification: string;
    createdAt: Date;
  }>;
  advisories: Array<{
    diseaseType: string;
    riskLevel: string;
    title: string;
  }>;
  recentReports: Array<{
    district: string;
    diseaseType: string;
    caseCount: number;
    deathCount: number;
    timestamp: Date;
    healthFacilityName: string | null;
    healthFacilityType: string | null;
  }>;
  nearbyFacilities: Array<{
    name: string;
    type: string;
    district: string;
    region: string;
    status: string | null;
  }>;
};

const SYSTEM_PROMPT = `You are ${env.CHAT_BOT_NAME} for Ethiopia public health use cases.
- Give concise, practical, safe health guidance.
- You are not a doctor; always include a short medical disclaimer.
- Use prior chat history to personalize replies for this user.
- The JSON blocks in the prompt are live summaries from the EthioSentinel database for this user's area ONLY. When the user asks about local spikes, trends, or what is happening nearby, summarize those facts clearly (diseases, rough counts, anomalies with z-scores if present). Never invent case numbers or alerts not present in the JSON.
- If severe symptoms are reported, advise urgent facility visit.
- Never invent numbers that are not in provided context.`;

export class ChatService {
  private static containsAny(text: string, terms: string[]) {
    const lower = text.toLowerCase();
    return terms.some((term) => lower.includes(term));
  }

  private static buildDistrictWhere(districtNames: string[]) {
    const cleaned = Array.from(
      new Set(districtNames.map((n) => n.trim()).filter(Boolean)),
    );
    if (cleaned.length === 0) {
      return undefined;
    }
    return {
      OR: cleaned.map((name) => ({
        district: {
          equals: name,
          mode: "insensitive" as const,
        },
      })),
    };
  }

  private static async getNearbyFacilities(input: {
    districtNames: string[];
    userRegion: string | null;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(12, input.limit ?? 6));
    const districts = Array.from(
      new Set(input.districtNames.map((n) => n.trim()).filter(Boolean)),
    );

    const districtOr = districts.flatMap((name) => [
      { Woreda: { equals: name, mode: "insensitive" as const } },
      { district: { name: { equals: name, mode: "insensitive" as const } } },
    ]);

    const facilities = await prisma.healthFacility.findMany({
      where: {
        ...(districtOr.length > 0 ? { OR: districtOr } : {}),
        ...(input.userRegion
          ? {
              AND: [
                {
                  OR: [
                    { Region: { equals: input.userRegion, mode: "insensitive" as const } },
                    {
                      region: {
                        name: {
                          equals: input.userRegion,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      select: {
        HF_Name: true,
        HF_Type: true,
        Woreda: true,
        Region: true,
        Status: true,
      },
      take: limit,
    });

    if (facilities.length > 0) {
      return facilities.map((f) => ({
        name: f.HF_Name,
        type: f.HF_Type,
        district: f.Woreda,
        region: f.Region,
        status: f.Status,
      }));
    }

    if (!input.userRegion) {
      return [];
    }

    const byRegion = await prisma.healthFacility.findMany({
      where: {
        OR: [
          { Region: { equals: input.userRegion, mode: "insensitive" } },
          {
            region: {
              name: {
                equals: input.userRegion,
                mode: "insensitive",
              },
            },
          },
        ],
      },
      select: {
        HF_Name: true,
        HF_Type: true,
        Woreda: true,
        Region: true,
        Status: true,
      },
      take: limit,
    });

    return byRegion.map((f) => ({
      name: f.HF_Name,
      type: f.HF_Type,
      district: f.Woreda,
      region: f.Region,
      status: f.Status,
    }));
  }

  private static tryDeterministicReply(input: {
    message: string;
    language: AppLanguage;
    context: UserDiseaseContext;
  }): string | null {
    const text = input.message.trim();
    const asksReportFacility = this.containsAny(text, [
      "report",
      "reported",
      "where was it reported",
      "which facility",
      "which health center",
      "ሪፖርት",
      "ሪፖርቱ",
      "የት",
      "የት ነው",
      "ተልኳል",
      "የተደረገ",
      "የጤና ጣቢያ",
      "ጤና ተቋም",
    ]);

    const asksNearbyFacility = this.containsAny(text, [
      "nearby",
      "nearest",
      "health center",
      "health facility",
      "clinic",
      "hospital",
      "ቅርብ",
      "በቅርብ",
      "ጤና ጣቢያ",
      "ጤና ተቋም",
      "ሆስፒታል",
      "ተቋም",
    ]);

    if (asksNearbyFacility) {
      const items = input.context.nearbyFacilities.slice(0, 5);
      if (input.language === "AMHARIC") {
        if (items.length === 0) {
          return [
            "በአሁኑ የውሂብ መረጃ ውስጥ በአቅራቢያዎ የጤና ተቋም ዝርዝር አልተገኘም።",
            "እባክዎ በአካባቢዎ ያለውን የጤና ቢሮ ወይም ሄልዝ ኤክስቴንሽን ባለሙያ ያነጋግሩ።",
            "(ማሳሰቢያ፦ እኔ ሐኪም አይደለሁም፤ ለሕክምና ውሳኔ የጤና ባለሙያ ያማክሩ።)",
          ].join(" ");
        }
        const list = items
          .map((f, i) => `${i + 1}. ${f.name} (${f.type}) - ${f.district}`)
          .join("\n");
        return [
          "በመረጃ ቋታችን መሰረት በአቅራቢያዎ የሚገኙ አንዳንድ የጤና ተቋማት እነዚህ ናቸው:",
          list,
          "ከባድ ምልክት ካለ አስቸኳይ ወደ ቅርብ የጤና ተቋም ይሂዱ።",
          "(ማሳሰቢያ፦ እኔ ሐኪም አይደለሁም፤ ለሕክምና ውሳኔ የጤና ባለሙያ ያማክሩ።)",
        ].join("\n\n");
      }

      if (items.length === 0) {
        return [
          "I could not find nearby facility records in the current dataset for your area.",
          "Please contact your local health office or health extension worker for the nearest open facility.",
          "I am an AI assistant, not a doctor. Please consult a healthcare professional.",
        ].join(" ");
      }

      const list = items
        .map((f, i) => `${i + 1}. ${f.name} (${f.type}) - ${f.district}`)
        .join("\n");
      return [
        "Based on current records, nearby facilities include:",
        list,
        "If symptoms are severe, seek urgent care at the nearest facility.",
        "I am an AI assistant, not a doctor. Please consult a healthcare professional.",
      ].join("\n\n");
    }

    if (asksReportFacility) {
      const latest = input.context.recentReports[0];
      if (input.language === "AMHARIC") {
        if (!latest) {
          return "በአሁኑ ጊዜ በአካባቢዎ የቅርብ ሪፖርት መረጃ አልተገኘም። (ማሳሰቢያ፦ እኔ ሐኪም አይደለሁም።)";
        }
        if (latest.healthFacilityName) {
          return [
            `የቅርቡ ሪፖርት ከ "${latest.healthFacilityName}" (${latest.healthFacilityType ?? "Health Facility"}) ጋር ተያይዞ ተመዝግቧል።`,
            `አካባቢ፦ ${latest.district}`,
            "(ማሳሰቢያ፦ እኔ ሐኪም አይደለሁም፤ ለሕክምና ውሳኔ የጤና ባለሙያ ያማክሩ።)",
          ].join(" ");
        }
        return [
          "በመረጃ መሠረት ሪፖርቱ በወረዳ/አካባቢ ደረጃ ተመዝግቧል እንጂ የተለየ የጤና ተቋም ስም አልተጠቀሰም።",
          `የቅርቡ ሪፖርት አካባቢ፦ ${latest.district}`,
          "(ማሳሰቢያ፦ እኔ ሐኪም አይደለሁም፤ ለሕክምና ውሳኔ የጤና ባለሙያ ያማክሩ።)",
        ].join(" ");
      }

      if (!latest) {
        return "I could not find a recent report in your area right now. I am an AI assistant, not a doctor.";
      }
      if (latest.healthFacilityName) {
        return `The latest report is linked to \"${latest.healthFacilityName}\" (${latest.healthFacilityType ?? "Health Facility"}) in ${latest.district}. I am an AI assistant, not a doctor.`;
      }
      return `Current records indicate district-level reporting in ${latest.district}, but no specific health facility is attached to that report. I am an AI assistant, not a doctor.`;
    }

    return null;
  }

  private static buildFallbackReply(language: AppLanguage, context: { userDistrict?: string | null; userRegion: string | null }) {
    if (language === "AMHARIC") {
      return [
        "አሁን ላይ የAI አገልግሎቴ በጊዜያዊነት አልተገኘም።",
        `እባክዎ በ${context.userDistrict ?? context.userRegion} አቅራቢያ ያለ የጤና ተቋም ምክር ይውሰዱ እና ከባድ ምልክት ካለ አስቸኳይ ህክምና ይፈልጉ።`,
        "እኔ AI ረዳት ነኝ፤ ሐኪም አይደለሁም። ለሕክምና ምርመራ የጤና ባለሙያን ያማክሩ።",
      ].join(" ");
    }

    return [
      "My AI service is temporarily unavailable.",
      `Please seek guidance from a nearby health facility in ${context.userDistrict ?? context.userRegion ?? "your area"}, especially if symptoms are severe.`,
      "I am an AI assistant, not a doctor. Please consult a healthcare professional for diagnosis and treatment.",
    ].join(" ");
  }


  private static async getOrCreateConversation(userId: string) {
    const latest = await prisma.chatConversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (latest) {
      return latest.id;
    }
    const created = await prisma.chatConversation.create({
      data: { userId, title: "Health chat" },
      select: { id: true },
    });
    return created.id;
  }

  private static mapLanguage(language?: string): AppLanguage {
    return String(language ?? "ENGLISH").toUpperCase() === "AMHARIC" ? "AMHARIC" : "ENGLISH";
  }

  /** Resolves which district names to use for report/anomaly queries (assigned district, or all districts in user's region). */
  private static async resolveUserAreaDistrictNames(user: {
    region: string | null;
    assignedDistrict: string | null;
  }): Promise<{ districtNames: string[]; scope: "DISTRICT" | "REGION" | "UNKNOWN" }> {
    const assigned = user.assignedDistrict?.trim();
    if (assigned) {
      return { districtNames: [assigned], scope: "DISTRICT" };
    }

    if (!user.region) {
      return { districtNames: [], scope: "UNKNOWN" };
    }

    const regionRow = await prisma.region.findFirst({
      where: { name: { equals: user.region.trim(), mode: "insensitive" } },
      select: { districts: { select: { name: true } } },
    });

    const names = regionRow?.districts.map((d) => d.name) ?? [];
    if (names.length === 0) {
      return { districtNames: [], scope: "UNKNOWN" };
    }
    return { districtNames: names, scope: "REGION" };
  }

  private static async getUserDiseaseContext(userId: string): Promise<UserDiseaseContext> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        region: true,
        assignedDistrict: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { districtNames, scope } = await this.resolveUserAreaDistrictNames(user);
    const districtWhere = this.buildDistrictWhere(districtNames);

    const reportWhere = {
      timestamp: { gte: thirtyDaysAgo },
      ...(districtWhere ?? {}),
    };

    const diseaseReports = await prisma.diseaseReport.groupBy({
      by: ["diseaseType"],
      where: reportWhere,
      _sum: { caseCount: true, deathCount: true },
      _count: { _all: true },
      orderBy: { _count: { diseaseType: "desc" } },
      take: 8,
    });

    const anomalyWhere = {
      createdAt: { gte: thirtyDaysAgo },
      classification: "ANOMALY" as const,
      ...(districtWhere ?? {}),
    };

    const recentAnomalies = await prisma.anomalySignal.findMany({
      where: anomalyWhere,
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        district: true,
        diseaseType: true,
        zScore: true,
        currentCases: true,
        historicalMean: true,
        stdDev: true,
        classification: true,
        createdAt: true,
      },
    });

    const advisories = await prisma.advisory.findMany({
      where: {
        status: "APPROVED",
        region: user.region ? {
          name: {
            equals: user.region,
            mode: "insensitive",
          },
        } : undefined,
      },
      select: {
        diseaseType: true,
        riskLevel: true,
        title: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const [recentReports, nearbyFacilities] = await Promise.all([
      prisma.diseaseReport.findMany({
        where: reportWhere,
        orderBy: { timestamp: "desc" },
        take: 12,
        select: {
          district: true,
          diseaseType: true,
          caseCount: true,
          deathCount: true,
          timestamp: true,
          healthFacility: {
            select: {
              HF_Name: true,
              HF_Type: true,
            },
          },
        },
      }),
      this.getNearbyFacilities({
        districtNames,
        userRegion: user.region,
      }),
    ]);

    return {
      userRegion: user.region,
      userDistrict: user.assignedDistrict,
      areaScope: scope,
      districtsInScope: districtNames,
      topDiseases: diseaseReports.map((item) => ({
        diseaseType: item.diseaseType,
        totalCases: item._sum.caseCount ?? 0,
        totalDeaths: item._sum.deathCount ?? 0,
        reports: item._count._all,
      })),
      recentAnomalies,
      advisories,
      recentReports: recentReports.map((row) => ({
        district: row.district,
        diseaseType: row.diseaseType,
        caseCount: row.caseCount,
        deathCount: row.deathCount,
        timestamp: row.timestamp,
        healthFacilityName: row.healthFacility?.HF_Name ?? null,
        healthFacilityType: row.healthFacility?.HF_Type ?? null,
      })),
      nearbyFacilities,
    };
  }

  private static async getPublicDiseaseContext() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [topDiseases, recentAnomalies, advisories] = await Promise.all([
      prisma.diseaseReport.groupBy({
        by: ["diseaseType"],
        where: { timestamp: { gte: thirtyDaysAgo } },
        _sum: { caseCount: true, deathCount: true },
        _count: { _all: true },
        orderBy: { _sum: { caseCount: "desc" } },
        take: 8,
      }),
      prisma.anomalySignal.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          classification: "ANOMALY",
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          district: true,
          diseaseType: true,
          zScore: true,
          currentCases: true,
          historicalMean: true,
          createdAt: true,
        },
      }),
      prisma.advisory.findMany({
        where: { status: "APPROVED" },
        select: {
          diseaseType: true,
          riskLevel: true,
          title: true,
          region: { select: { name: true } },
          district: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    return {
      scope: "PUBLIC_NATIONAL_ETHIOPIA",
      topDiseases: topDiseases.map((item) => ({
        diseaseType: item.diseaseType,
        totalCases: item._sum.caseCount ?? 0,
        totalDeaths: item._sum.deathCount ?? 0,
        reports: item._count._all,
      })),
      recentAnomalies,
      advisories: advisories.map((item) => ({
        diseaseType: item.diseaseType,
        riskLevel: item.riskLevel,
        title: item.title,
        region: item.region.name,
        district: item.district?.name ?? null,
      })),
    };
  }


  public static async requestGeminiReply(input: { prompt: string }) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const modelsToTry = ["gemini-flash-latest", ];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(input.prompt);
          const response = result.response;
          const text = response.text().trim();

          if (text) return text;
        } catch (error: any) {
          lastError = error;
          const is503 = error.message?.includes("503") || error.status === 503;
          const is404 = error.message?.includes("404") || error.status === 404;

          if (is404) break; // Try next model immediately if 404
          if (!is503 || attempt === 3) break; // Don't retry if not 503 or last attempt

          Logger.warn(`Gemini ${modelName} failed with 503, retrying... (attempt ${attempt}/3)`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }

    Logger.error("All Gemini models failed", { error: lastError?.message });
    throw lastError || new Error("All Gemini models failed");
  }

  private static async requestAssistantReply(input: {
    prompt: string;
    language: AppLanguage;
  }): Promise<{ text: string; provider: string }> {
    const text = await this.requestGeminiReply({ prompt: input.prompt });
    return { text, provider: "GEMINI" };
  }

  static async getChatHistory(userId: string): Promise<PersistedChatMessage[]> {
    const conversationId = await this.getOrCreateConversation(userId);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        language: true,
        createdAt: true,
      },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.content,
      language: this.mapLanguage(m.language),
      createdAt: m.createdAt,
    }));
  }

  static async clearChatHistory(userId: string): Promise<void> {
    const conversationId = await this.getOrCreateConversation(userId);
    await prisma.chatMessage.deleteMany({
      where: { conversationId },
    });
  }

  static async sendMessage(input: { userId: string; message: string; language?: string }) {
    const text = String(input.message ?? "").trim();
    if (!text) {
      throw new AppError("message is required", 400);
    }

    const language = this.mapLanguage(input.language);
    const conversationId = await this.getOrCreateConversation(input.userId);

    await prisma.chatMessage.create({
      data: {
        conversationId,
        role: "USER",
        content: text,
        language,
      },
    });

    const history = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: { role: true, content: true },
    });

    const diseaseContext = await this.getUserDiseaseContext(input.userId);
    const languageInstruction =
      language === "AMHARIC"
        ? `Respond only in Amharic (አማርኛ). Write full sentences using Ethiopic Unicode script (e.g. ሰላም) — do not use Latin letters for Amharic words. If you include disease names that are commonly used in English, you may keep them in Latin. Never answer in English when the user wrote in Amharic.`
        : "Respond only in English.";

    const prompt = [
      SYSTEM_PROMPT,
      languageInstruction,
      "",
      `User location context: region=${diseaseContext.userRegion}, district=${diseaseContext.userDistrict ?? "N/A"}, coverage=${diseaseContext.areaScope}`,
      `Districts included in summaries: ${JSON.stringify(diseaseContext.districtsInScope)}`,
      `Recent disease report totals (last ~30 days by diseaseType): ${JSON.stringify(diseaseContext.topDiseases)}`,
      `Statistical anomaly signals in this area (from z-score engine, last ~30 days): ${JSON.stringify(diseaseContext.recentAnomalies)}`,
      `Recent approved advisories: ${JSON.stringify(diseaseContext.advisories)}`,
      `Recent report rows with source facility when present: ${JSON.stringify(diseaseContext.recentReports)}`,
      `Nearby health facilities from DB in this user's area: ${JSON.stringify(diseaseContext.nearbyFacilities)}`,
      "When asked where a report was submitted, use `recentReports` and mention facility only if `healthFacilityName` exists; otherwise say it is district-level only.",
      "When asked for nearby health centers, list items from `nearbyFacilities` directly and do not claim no data if this list is non-empty.",
      "",
      "Conversation history:",
      ...history.map((item) => `${item.role}: ${item.content}`),
      "",
      `Current user message: ${text}`,
    ].join("\n");

    const deterministic = this.tryDeterministicReply({
      message: text,
      language,
      context: diseaseContext,
    });

    if (deterministic) {
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: deterministic,
          language,
          modelProvider: "RULES",
        },
        select: {
          id: true,
          role: true,
          content: true,
          language: true,
          createdAt: true,
        },
      });

      return {
        id: assistantMessage.id,
        role: assistantMessage.role,
        text: assistantMessage.content,
        language: this.mapLanguage(assistantMessage.language),
        createdAt: assistantMessage.createdAt,
        provider: "RULES",
      };
    }

    let ai: { text: string; provider: string };
    try {
      ai = await this.requestAssistantReply({
        prompt,
        language,
      });
    } catch (error) {
      Logger.error("All chat providers failed, returning fallback response", { error });
      ai = {
        text: this.buildFallbackReply(language, {
          userDistrict: diseaseContext.userDistrict,
          userRegion: diseaseContext.userRegion,
        }),
        provider: "FALLBACK",
      };
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: ai.text,
        language,
        modelProvider: ai.provider,
      },
      select: {
        id: true,
        role: true,
        content: true,
        language: true,
        createdAt: true,
      },
    });

    return {
      id: assistantMessage.id,
      role: assistantMessage.role,
      text: assistantMessage.content,
      language: this.mapLanguage(assistantMessage.language),
      createdAt: assistantMessage.createdAt,
      provider: ai.provider,
    };
  }

  static async sendPublicMessage(input: { message: string; language?: string }) {
    const text = String(input.message ?? "").trim();
    if (!text) {
      throw new AppError("message is required", 400);
    }

    const language = this.mapLanguage(input.language);
    const context = await this.getPublicDiseaseContext();
    const languageInstruction =
      language === "AMHARIC"
        ? `Respond only in Amharic (አማርኛ). Keep it concise and safe.`
        : "Respond only in English. Keep it concise and safe.";

    const prompt = [
      SYSTEM_PROMPT,
      languageInstruction,
      "This is an anonymous public visitor. Do not imply saved history or personalized district access.",
      "Give general public advisory guidance and invite sign up for personalized, unlimited advisory chat.",
      `National public context: ${JSON.stringify(context)}`,
      `Visitor message: ${text}`,
    ].join("\n");

    let ai: { text: string; provider: string };
    try {
      ai = await this.requestAssistantReply({ prompt, language });
    } catch (error) {
      Logger.error("Public chat provider failed, returning fallback response", { error });
      ai = {
        text: this.buildFallbackReply(language, {
          userRegion: "Ethiopia",
          userDistrict: null,
        }),
        provider: "FALLBACK",
      };
    }

    return {
      id: `guest-${Date.now()}`,
      role: "ASSISTANT" as const,
      text: ai.text,
      language,
      createdAt: new Date(),
      provider: ai.provider,
    };
  }
}

