import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { AdvisoryStatus } from "@prisma/client";

export class SearchService {
  static async globalSearch(q: string, limit = 15) {
    const term = String(q ?? "").trim();
    if (term.length > 200) {
      throw new AppError("q must be at most 200 characters", 400);
    }
    if (!term) {
      return { query: "", advisories: [], diseases: [] };
    }
    const cap = Math.max(1, Math.min(50, limit));
    const mode = "insensitive" as const;

    const [advisories, diseases] = await Promise.all([
      prisma.advisory.findMany({
        where: {
          status: { in: [AdvisoryStatus.APPROVED, AdvisoryStatus.DRAFT] },
          OR: [
            { title: { contains: term, mode } },
            { content: { contains: term, mode } },
            { diseaseType: { contains: term, mode } },
          ],
        },
        take: cap,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          diseaseType: true,
          riskLevel: true,
          content: true,
          language: true,
          status: true,
          region: { select: { name: true, code: true } },
        },
      }),
      prisma.disease.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: term, mode } },
            { description: { contains: term, mode } },
            { code: { contains: term, mode } },
          ],
        },
        take: cap,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
        },
      }),
    ]);

    return { query: term, advisories, diseases };
  }
}
