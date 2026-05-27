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

const SYSTEM_PROMPT = `You are ${env.CHAT_BOT_NAME} for Ethiopia public health use cases.
- Give concise, practical, safe health guidance.
- You are not a doctor; always include a short medical disclaimer.
- Use prior chat history to personalize replies for this user.
- The JSON blocks in the prompt are live summaries from the EthioSentinel database for this user's area ONLY. When the user asks about local spikes, trends, or what is happening nearby, summarize those facts clearly (diseases, rough counts, anomalies with z-scores if present). Never invent case numbers or alerts not present in the JSON.
- If severe symptoms are reported, advise urgent facility visit.
- Never invent numbers that are not in provided context.`;

export class ChatService {
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

  private static districtWhereClause(districtNames: string[]) {
    if (districtNames.length === 0) {
      return undefined;
    }
    if (districtNames.length === 1) {
      return {
        equals: districtNames[0],
        mode: "insensitive" as const,
      };
    }
    return { in: districtNames };
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

  private static async getUserDiseaseContext(userId: string) {
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
    const districtFilter = this.districtWhereClause(districtNames);

    const reportWhere = {
      timestamp: { gte: thirtyDaysAgo },
      ...(districtFilter ? { district: districtFilter } : {}),
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
      ...(districtFilter ? { district: districtFilter } : {}),
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
      "",
      "Conversation history:",
      ...history.map((item) => `${item.role}: ${item.content}`),
      "",
      `Current user message: ${text}`,
    ].join("\n");

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

