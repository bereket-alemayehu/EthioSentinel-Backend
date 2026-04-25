import http from "http";
import https from "https";
import { URL } from "url";
import { prisma } from "../lib/prisma";
import { env } from "../config/env.config";
import { AppError } from "../utils/AppError";
import Logger from "../utils/logger";

type AppLanguage = "ENGLISH" | "AMHARIC";

type ChatRole = "USER" | "ASSISTANT";

type PersistedChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  language: AppLanguage;
  createdAt: Date;
};

const SYSTEM_PROMPT = `You are EthioSentinel Assistant for Ethiopia public health use cases.
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

  private static async postJson(urlString: string, payload: unknown, headers?: Record<string, string>) {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;
    const requestBody = JSON.stringify(payload);

    return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = client.request(
        {
          method: "POST",
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(requestBody),
            ...(headers ?? {}),
          },
          timeout: env.AI_SERVICE_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode ?? 500,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );

      req.on("timeout", () => req.destroy(new Error("Chat provider request timed out")));
      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });
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

  private static async requestHuggingFaceReply(input: { prompt: string; language: AppLanguage }) {
    const modelPath = `${env.AI_CHAT_BASE_URL.replace(/\/$/, "")}/${encodeURIComponent(env.AI_CHAT_MODEL)}`;
    const response = await this.postJson(
      modelPath,
      {
        inputs: input.prompt,
        parameters: {
          max_new_tokens: 350,
          temperature: 0.4,
          return_full_text: false,
        },
      },
      env.AI_CHAT_API_KEY ? { Authorization: `Bearer ${env.AI_CHAT_API_KEY}` } : undefined,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`HuggingFace returned status ${response.statusCode}`);
    }

    const parsed = JSON.parse(response.body) as Array<{ generated_text?: string }>;
    const generated = parsed?.[0]?.generated_text?.trim();
    if (!generated) {
      throw new Error("Empty HuggingFace response");
    }
    return generated;
  }

  private static async requestGeminiReply(input: { prompt: string }) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const response = await this.postJson(endpoint, {
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.4 },
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Gemini returned status ${response.statusCode}`);
    }

    const parsed = JSON.parse(response.body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return text;
  }

  private static async requestAssistantReply(input: {
    prompt: string;
    language: AppLanguage;
  }): Promise<{ text: string; provider: string }> {
    const preferred = String(env.AI_CHAT_PROVIDER).toUpperCase();
    if (preferred === "HUGGINGFACE") {
      try {
        const text = await this.requestHuggingFaceReply(input);
        return { text, provider: "HUGGINGFACE" };
      } catch (error) {
        Logger.warn("HuggingFace chat failed, falling back to Gemini", { error });
      }
    }

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

