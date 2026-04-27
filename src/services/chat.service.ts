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
- Use regional disease context when relevant.
- If severe symptoms are reported, advise urgent facility visit.
- Never invent numbers that are not in provided context.`;

export class ChatService {
  private static buildFallbackReply(language: AppLanguage, context: { userDistrict?: string | null; userRegion: string }) {
    if (language === "AMHARIC") {
      return [
        "አሁን ላይ የAI አገልግሎቴ በጊዜያዊነት አልተገኘም።",
        `እባክዎ በ${context.userDistrict ?? context.userRegion} አቅራቢያ ያለ የጤና ተቋም ምክር ይውሰዱ እና ከባድ ምልክት ካለ አስቸኳይ ህክምና ይፈልጉ።`,
        "እኔ AI ረዳት ነኝ፤ ሐኪም አይደለሁም። ለሕክምና ምርመራ የጤና ባለሙያን ያማክሩ።",
      ].join(" ");
    }

    return [
      "My AI service is temporarily unavailable.",
      `Please seek guidance from a nearby health facility in ${context.userDistrict ?? context.userRegion}, especially if symptoms are severe.`,
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

    const district = user.assignedDistrict ?? undefined;

    const diseaseReports = await prisma.diseaseReport.groupBy({
      by: ["diseaseType"],
      where: {
        ...(district ? { district } : {}),
        timestamp: { gte: thirtyDaysAgo },
      },
      _sum: { caseCount: true, deathCount: true },
      _count: { _all: true },
      orderBy: { _count: { diseaseType: "desc" } },
      take: 5,
    });

    const advisories = await prisma.advisory.findMany({
      where: {
        status: "APPROVED",
        region: {
          name: {
            equals: user.region,
            mode: "insensitive",
          },
        },
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
      topDiseases: diseaseReports.map((item) => ({
        diseaseType: item.diseaseType,
        totalCases: item._sum.caseCount ?? 0,
        totalDeaths: item._sum.deathCount ?? 0,
        reports: item._count._all,
      })),
      advisories,
    };
  }


  private static async requestGeminiReply(input: { prompt: string }) {
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
        ? "Respond only in Amharic."
        : "Respond only in English.";

    const prompt = [
      SYSTEM_PROMPT,
      languageInstruction,
      "",
      `User location context: region=${diseaseContext.userRegion}, district=${diseaseContext.userDistrict ?? "N/A"}`,
      `Recent disease status summary: ${JSON.stringify(diseaseContext.topDiseases)}`,
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
}

