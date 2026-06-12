import { prisma } from "../lib/prisma";
import { env } from "../config/env.config";
import { AppError } from "../utils/AppError";
import Logger from "../utils/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizePublicHealthText } from "../utils/healthMessaging";

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

const SYSTEM_PROMPT = `You are ${env.CHAT_BOT_NAME}, a community health assistant for Ethiopia.
- Keep every reply SHORT: at most 2–3 short sentences OR up to 3 brief bullet lines.
- Give practical, safe guidance. You are not a doctor; one short disclaimer when needed.
- JSON blocks are live summaries for this user's area ONLY. Summarize diseases and counts; say "higher than usual" or "being monitored" — never mention z-scores, anomaly detection, or baselines.
- Say "health guidance" not "advisory". For severe symptoms, advise urgent facility visit in one line.
- Never invent numbers not in the JSON.`;

const CHAT_FORBIDDEN_TERMS =
  /\b(z-?score|anomaly detection|anomaly signal|baseline mean|AI draft|advisory pipeline)\b/gi;

export class ChatService {
  /**
   * Track which API key (if any) has hit the quota limit, and WHEN.
   * After GEMINI_BLOCK_DURATION_MS the block expires automatically so the
   * key is retried without requiring a server restart.
   */
  private static blockedGeminiApiKey: string | null = null;
  private static blockedGeminiAt: number = 0;
  /** How long (ms) to pause Gemini calls after a 429 — 30 minutes. */
  private static readonly GEMINI_BLOCK_DURATION_MS = 30 * 60 * 1000;

  private static isGeminiCurrentlyBlocked(): boolean {
    if (!this.blockedGeminiApiKey) return false;
    if (this.blockedGeminiApiKey !== env.GEMINI_API_KEY) {
      // API key changed in env — clear the block
      this.blockedGeminiApiKey = null;
      return false;
    }
    if (Date.now() - this.blockedGeminiAt > this.GEMINI_BLOCK_DURATION_MS) {
      // Block has expired — retry
      Logger.info("Gemini quota block expired, retrying API key");
      this.blockedGeminiApiKey = null;
      return false;
    }
    return true;
  }

  private static blockGeminiKey(): void {
    this.blockedGeminiApiKey = env.GEMINI_API_KEY;
    this.blockedGeminiAt = Date.now();
  }

  private static isGeminiQuotaError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes("GEMINI_QUOTA_EXCEEDED") || msg.includes("429");
  }

  private static sanitizeChatReply(text: string): string {
    const cleaned = sanitizePublicHealthText(text)
      .replace(/\badvisory\b/gi, "health guidance")
      .replace(/\badvisories\b/gi, "health updates")
      .replace(CHAT_FORBIDDEN_TERMS, "unusual illness activity")
      .trim();
    const brief = cleaned || text.trim();
    const maxLen = 480;
    if (brief.length <= maxLen) return brief;
    const cut = brief.slice(0, maxLen);
    const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("።"));
    return (lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut}…`).trim();
  }

  private static formatAreaActivityForChat(
    rows: Array<{
      district: string;
      diseaseType: string;
      currentCases: number;
      zScore: number | null;
      createdAt: Date;
    }>,
  ) {
    return rows.map((row) => ({
      area: row.district,
      disease: row.diseaseType,
      recentCases: Math.round(row.currentCases),
      concern:
        row.zScore != null && row.zScore >= 2
          ? "higher than usual"
          : "being monitored",
    }));
  }

  private static formatGuidanceForChat(
    rows: UserDiseaseContext["advisories"],
  ) {
    return rows.map((row) => ({
      disease: row.diseaseType,
      riskLevel: row.riskLevel,
      headline: row.title.replace(/^AI\s*Draft:\s*/i, "").trim(),
    }));
  }

  private static resolveEffectiveLanguage(
    message: string,
    preferred?: string,
  ): AppLanguage {
    const msg = message.trim();
    if (/[\u1200-\u137F]/.test(msg)) {
      return "AMHARIC";
    }
    const lower = msg.toLowerCase();
    if (
      this.containsAny(lower, [
        "speak amharic",
        "speak in amharic",
        "in amharic",
        "use amharic",
        "reply in amharic",
        "amharic please",
        "please speak in amharic",
        "talk in amharic",
      ])
    ) {
      return "AMHARIC";
    }
    if (
      this.containsAny(lower, [
        "speak english",
        "speak in english",
        "in english",
        "reply in english",
      ])
    ) {
      return "ENGLISH";
    }
    return this.mapLanguage(preferred);
  }

  private static isLanguagePreferenceRequest(text: string): boolean {
    const lower = text.toLowerCase();
    if (/[\u1200-\u137F]/.test(text)) {
      return this.containsAny(lower, ["አማርኛ", "ብቻ", "ተናገር", "መልስ"]);
    }
    return this.containsAny(lower, [
      "speak amharic",
      "speak in amharic",
      "in amharic",
      "use amharic",
      "reply in amharic",
      "amharic please",
      "please speak in amharic",
      "talk in amharic",
      "speak english",
      "speak in english",
      "reply in english",
    ]);
  }

  private static isGreeting(text: string): boolean {
    const t = text.trim();
    if (t.length > 48) return false;
    return /^(hi|hello|hey|good\s+(morning|afternoon|evening)|ሰላም|እንደምን|እንዴት\s+ነህ|እንዴት\s+ነሽ)/i.test(t);
  }

  private static asksLocalHealthInfo(text: string): boolean {
    const lower = text.toLowerCase();
    if (/[\u1200-\u137F]/.test(text)) {
      return this.containsAny(lower, [
        "በሽታ",
        "ኬስ",
        "ሞት",
        "ስርጭት",
        "ኮሌራ",
        "ማላሪያ",
        "ወረርሽኝ",
        "አካባቢ",
        "ወረዳ",
        "ክፍተት",
        "ጤና",
        "ምልክት",
      ]);
    }
    return this.containsAny(lower, [
      "cholera",
      "malaria",
      "measles",
      "dengue",
      "typhoid",
      "disease",
      "cases",
      "outbreak",
      "spread",
      "symptom",
      "sick",
      "local",
      "near me",
      "my area",
      "how many",
      "situation",
      "update",
    ]);
  }

  private static buildContextualShortReply(
    language: AppLanguage,
    context: {
      userDistrict: string | null;
      userRegion: string | null;
      topDiseases: UserDiseaseContext["topDiseases"];
      recentAnomalies: Array<{ district: string; diseaseType: string }>;
      advisories: UserDiseaseContext["advisories"];
      nearbyFacilities: UserDiseaseContext["nearbyFacilities"];
    },
    userMessage: string,
  ): string {
    const area =
      context.userDistrict ?? context.userRegion ?? (language === "AMHARIC" ? "አካባቢዎ" : "your area");

    if (this.isLanguagePreferenceRequest(userMessage)) {
      return language === "AMHARIC"
        ? "እሺ፣ አሁን በአማርኛ እመለሳለሁ። ስለ ምልክቶች፣ መከላከል ወይም የአካባቢ ጤና ሁኔታ ጠይቁ። እኔ ሐኪም አይደለሁም።"
        : "Sure — I'll reply in English. Ask about symptoms, prevention, or health near you. I am not a doctor.";
    }

    if (this.isGreeting(userMessage)) {
      return language === "AMHARIC"
        ? "ሰላም! ስለ ምልክቶች፣ መከላከል ወይም የአካባቢ ጤና መረጃ ማንኛውንም ጥያቄ መጠየቅ ይችላሉ። እኔ ሐኪም አይደለሁም።"
        : "Hello! Ask about symptoms, prevention, or health in your area. I am not a doctor.";
    }

    const asksFacility =
      /hospital|clinic|facility|health center|ተቋም|ሆስፒታል|ክሊኒክ|ቅርብ/i.test(userMessage);

    if (asksFacility && context.nearbyFacilities.length > 0) {
      const names = context.nearbyFacilities
        .slice(0, 3)
        .map((f) => f.name)
        .join(language === "AMHARIC" ? "፣ " : ", ");
      return language === "AMHARIC"
        ? `በ${area} ቅርብ የጤና ተቋሞች፦ ${names}። ከባድ ምልክት ካለ ወዲያውኑ ይሂዱ።`
        : `Nearby facilities near ${area}: ${names}. Go immediately if symptoms are severe.`;
    }

    if (!this.asksLocalHealthInfo(userMessage)) {
      return language === "AMHARIC"
        ? "ጥያቄዎን ለመመለስ ዝግጁ ነኝ። ስለ ምልክቶች፣ መከላከል ወይም በአካባቢዎ ያለው የጤና ሁኔታ ጠይቁ። እኔ ሐኪም አይደለሁም።"
        : "I'm here to help with symptoms, prevention, or health in your area. Ask a specific question. I am not a doctor.";
    }

    const top = context.topDiseases[0];
    const spike = context.recentAnomalies[0];
    const disease = top?.diseaseType ?? spike?.diseaseType;
    const elevated = Boolean(spike);

    if (language === "AMHARIC") {
      if (disease) {
        const activity = elevated
          ? `በ${area} ስለ ${disease} ከመደበኛው በላይ እንቅስቃሴ እየታየ ነው።`
          : `በ${area} ስለ ${disease} የጤና ቅርበቶች እየተከታተሉ ነው።`;
        return `${activity} ለዝርዝር ምክር ቅርብ የጤና ተቋም ይጠይቁ። እኔ ሐኪም አይደለሁም።`;
      }
      return `በ${area} ቅርብ የጤና ተቋም ይጠይቁ። እኔ ሐኪም አይደለሁም።`;
    }

    if (disease) {
      const activity = elevated
        ? `In ${area}, ${disease} activity looks higher than usual right now.`
        : `In ${area}, health officials are monitoring ${disease}.`;
      return `${activity} Visit a nearby facility for personal advice. I am not a doctor.`;
    }
    return `Limited data for ${area}. Visit a nearby health facility with questions. I am not a doctor.`;
  }

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

    if (this.isLanguagePreferenceRequest(text)) {
      return input.language === "AMHARIC"
        ? "እሺ፣ አሁን በአማርኛ እመለሳለሁ። ስለ ምልክቶች፣ መከላከል ወይም የአካባቢ ጤና ሁኔታ ጠይቁ። እኔ ሐኪም አይደለሁም።"
        : "Sure — I'll reply in English. Ask about symptoms, prevention, or health near you. I am not a doctor.";
    }

    if (this.isGreeting(text)) {
      return input.language === "AMHARIC"
        ? "ሰላም! ስለ ምልክቶች፣ መከላከል ወይም የአካባቢ ጤና መረጃ ማንኛውንም ጥያቄ መጠየቅ ይችላሉ። እኔ ሐኪም አይደለሁም።"
        : "Hello! Ask about symptoms, prevention, or health in your area. I am not a doctor.";
    }

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

  private static buildFallbackReply(
    language: AppLanguage,
    context: { userDistrict?: string | null; userRegion: string | null },
  ) {
    const area =
      context.userDistrict ?? context.userRegion ?? (language === "AMHARIC" ? "አካባቢዎ" : "your area");
    if (language === "AMHARIC") {
      return `አገልግሎቱ ለጊዜው አልተገኘም። በ${area} ቅርብ የጤና ተቋም ይጠይቁ። እኔ ሐኪም አይደለሁም።`;
    }
    return `Service is busy. Visit a health facility near ${area} if needed. I am not a doctor.`;
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
          stdDev: true,
          classification: true,
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
    // Check time-based block (auto-expires after GEMINI_BLOCK_DURATION_MS)
    if (this.isGeminiCurrentlyBlocked()) {
      throw new Error("GEMINI_QUOTA_EXCEEDED");
    }

    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const modelsToTry = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-flash-latest",
    ];
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      if (this.isGeminiCurrentlyBlocked()) break;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(input.prompt);
          const response = result.response;
          const text = response.text().trim();

          if (text) return text;
        } catch (error: unknown) {
          lastError = error;
          const err = error as { message?: string; status?: number };
          const msg = err.message ?? "";
          const is429 = err.status === 429 || msg.includes("429");
          const is503 = msg.includes("503") || err.status === 503;
          const is404 = msg.includes("404") || err.status === 404;

          if (is429) {
            this.blockGeminiKey();
            Logger.warn(
              `Gemini free-tier quota reached; blocking for ${this.GEMINI_BLOCK_DURATION_MS / 60000} minutes. Will auto-retry after that.`,
            );
            break;
          }
          if (is404) break;
          if (!is503 || attempt === 2) break;

          Logger.warn(`Gemini ${modelName} failed with 503, retrying... (attempt ${attempt}/2)`);
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }
      }
    }

    if (!this.isGeminiCurrentlyBlocked()) {
      Logger.error("All Gemini models failed", {
        error:
          lastError instanceof Error
            ? lastError.message
            : String(lastError ?? "unknown"),
      });
    }
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
      text:
        m.role === "ASSISTANT"
          ? this.sanitizeChatReply(m.content)
          : m.content,
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

    const language = this.resolveEffectiveLanguage(text, input.language);
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
        ? `መልስዎን በአማርኛ ብቻ (Ethiopic Unicode)። አጭር — ከ3 ዓረፍተ ነገሮች አይበልጡ።`
        : "Respond only in English. Max 3 short sentences.";

    const prompt = [
      SYSTEM_PROMPT,
      languageInstruction,
      "",
      `User location context: region=${diseaseContext.userRegion}, district=${diseaseContext.userDistrict ?? "N/A"}, coverage=${diseaseContext.areaScope}`,
      `Districts included in summaries: ${JSON.stringify(diseaseContext.districtsInScope)}`,
      `Recent disease report totals (last ~30 days): ${JSON.stringify(diseaseContext.topDiseases)}`,
      `Higher-than-usual illness activity: ${JSON.stringify(this.formatAreaActivityForChat(diseaseContext.recentAnomalies))}`,
      `Recent health guidance: ${JSON.stringify(this.formatGuidanceForChat(diseaseContext.advisories))}`,
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
      const safeDeterministic = this.sanitizeChatReply(deterministic);
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: safeDeterministic,
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
        text: safeDeterministic,
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
      ai = { ...ai, text: this.sanitizeChatReply(ai.text) };
    } catch (error) {
      if (this.isGeminiQuotaError(error)) {
        Logger.warn("Gemini quota reached; using rule-based chat reply");
      } else {
        Logger.error("All chat providers failed, returning contextual fallback", { error });
      }
      ai = {
        text: this.buildContextualShortReply(language, diseaseContext, text),
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

    const language = this.resolveEffectiveLanguage(text, input.language);
    const context = await this.getPublicDiseaseContext();
    const languageInstruction =
      language === "AMHARIC"
        ? `መልስዎን በአማርኛ ብቻ (Ethiopic)። አጭር — ከ3 ዓረፍተ ነገሮች አይበልጡ።`
        : "Respond only in English. Max 3 short sentences.";

    const deterministic = this.tryDeterministicReply({
      message: text,
      language,
      context: {
        userRegion: "Ethiopia",
        userDistrict: null,
        areaScope: "UNKNOWN",
        districtsInScope: [],
        topDiseases: context.topDiseases,
        recentAnomalies: context.recentAnomalies,
        advisories: context.advisories.map((a) => ({
          diseaseType: a.diseaseType,
          riskLevel: a.riskLevel,
          title: a.title,
        })),
        recentReports: [],
        nearbyFacilities: [],
      },
    });

    if (deterministic) {
      return {
        id: `guest-${Date.now()}`,
        role: "ASSISTANT" as const,
        text: this.sanitizeChatReply(deterministic),
        language,
        createdAt: new Date(),
        provider: "RULES",
      };
    }

    const prompt = [
      SYSTEM_PROMPT,
      languageInstruction,
      "This is an anonymous public visitor. Do not imply saved history or personalized district access.",
      "Give general public health guidance and invite sign up for personalized health chat.",
      `National public context: ${JSON.stringify({
        topDiseases: context.topDiseases,
        elevatedAreas: this.formatAreaActivityForChat(context.recentAnomalies),
        healthGuidance: this.formatGuidanceForChat(
          context.advisories.map((a) => ({
            diseaseType: a.diseaseType,
            riskLevel: a.riskLevel,
            title: a.title,
          })),
        ),
      })}`,
      `Visitor message: ${text}`,
    ].join("\n");

    let ai: { text: string; provider: string };
    try {
      ai = await this.requestAssistantReply({ prompt, language });
      ai = { ...ai, text: this.sanitizeChatReply(ai.text) };
    } catch (error) {
      if (this.isGeminiQuotaError(error)) {
        Logger.warn("Gemini quota reached; using rule-based public chat reply");
      } else {
        Logger.error("Public chat provider failed, returning contextual fallback", { error });
      }
      ai = {
        text: this.buildContextualShortReply(
          language,
          {
            userRegion: "Ethiopia",
            userDistrict: null,
            topDiseases: context.topDiseases,
            recentAnomalies: context.recentAnomalies,
            advisories: context.advisories.map((a) => ({
              diseaseType: a.diseaseType,
              riskLevel: a.riskLevel,
              title: a.title,
            })),
            nearbyFacilities: [],
          },
          text,
        ),
        provider: "FALLBACK",
      };
    }

    return {
      id: `guest-${Date.now()}`,
      role: "ASSISTANT" as const,
      text: this.sanitizeChatReply(ai.text),
      language,
      createdAt: new Date(),
      provider: ai.provider,
    };
  }
}

