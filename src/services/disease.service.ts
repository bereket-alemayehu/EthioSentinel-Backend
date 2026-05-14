import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { AuditService } from "./audit.service";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "disease";
}

async function uniqueSlug(preferred: string): Promise<string> {
  let candidate = preferred;
  let n = 0;
  while (
    await prisma.disease.findFirst({
      where: { slug: candidate },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${preferred}-${n}`;
  }
  return candidate;
}

/** Slug unique among rows other than `excludeId` (for updates). */
async function uniqueSlugExcludeId(
  preferred: string,
  excludeId: number,
): Promise<string> {
  let candidate = preferred;
  let n = 0;
  while (
    await prisma.disease.findFirst({
      where: { slug: candidate, id: { not: excludeId } },
      select: { id: true },
    })
  ) {
    n += 1;
    candidate = `${preferred}-${n}`;
  }
  return candidate;
}

export class DiseaseService {
  /** Active diseases for public and field-worker pickers (e.g. HEW). */
  static async getAllDiseases() {
    return prisma.disease.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  /** Full catalog including inactive — admin / super-admin consoles. */
  static async getDiseaseCatalog() {
    return prisma.disease.findMany({
      orderBy: { name: "asc" },
    });
  }

  static async createDisease(
    data: {
      name?: string;
      slug?: string;
      code?: string;
      description?: string;
      symptomProfile?: string;
      isActive?: boolean;
    },
    audit?: {
      actorUserId: string;
      actorEmail: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ) {
    const name = String(data.name ?? "").trim();
    const code = String(data.code ?? "").trim();
    if (!name || !code) {
      throw new AppError("Name and code are required", 400);
    }

    const slugIn = String(data.slug ?? "").trim();
    const slug = await uniqueSlug(slugify(slugIn || name));

    const clash = await prisma.disease.findFirst({
      where: { OR: [{ code }, { name }] },
    });
    if (clash) {
      throw new AppError("A disease with this name or code already exists", 409);
    }

    const created = await prisma.disease.create({
      data: {
        name,
        slug,
        code,
        description: data.description?.trim() || null,
        symptomProfile: data.symptomProfile?.trim() || null,
        isActive: data.isActive ?? true,
      },
    });

    if (audit) {
      await AuditService.append({
        action: "DISEASE_CREATED",
        actorUserId: audit.actorUserId,
        actorEmail: audit.actorEmail,
        resourceType: "Disease",
        resourceId: String(created.id),
        metadata: {
          summary: `Registered disease type "${created.name}" (${created.code})`,
          name: created.name,
          code: created.code,
          slug: created.slug,
        },
        ipAddress: audit.ip,
        userAgent: audit.userAgent,
      });
    }

    return created;
  }

  static async updateDisease(
    id: number,
    data: {
      name?: string;
      slug?: string;
      code?: string;
      description?: string | null;
      symptomProfile?: string | null;
      isActive?: boolean;
    },
    audit?: {
      actorUserId: string;
      actorEmail: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ) {
    const existing = await prisma.disease.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Disease not found", 404);
    }

    const nextName =
      data.name !== undefined ? String(data.name).trim() : existing.name;
    const nextCode =
      data.code !== undefined ? String(data.code).trim() : existing.code;

    let nextSlug = existing.slug;
    if (data.slug !== undefined) {
      const raw = String(data.slug).trim();
      const base = raw ? slugify(raw) : slugify(nextName);
      nextSlug = await uniqueSlugExcludeId(base, id);
    }

    if (!nextName || !nextCode) {
      throw new AppError("Name and code cannot be empty", 400);
    }

    const nameOwner = await prisma.disease.findFirst({
      where: { name: nextName, id: { not: id } },
    });
    if (nameOwner) {
      throw new AppError("Another disease already uses this name", 409);
    }

    const codeOwner = await prisma.disease.findFirst({
      where: { code: nextCode, id: { not: id } },
    });
    if (codeOwner) {
      throw new AppError("Another disease already uses this code", 409);
    }

    const updated = await prisma.disease.update({
      where: { id },
      data: {
        name: nextName,
        code: nextCode,
        slug: nextSlug,
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.symptomProfile !== undefined
          ? { symptomProfile: data.symptomProfile?.trim() || null }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    if (audit) {
      await AuditService.append({
        action: "DISEASE_UPDATED",
        actorUserId: audit.actorUserId,
        actorEmail: audit.actorEmail,
        resourceType: "Disease",
        resourceId: String(id),
        metadata: {
          summary: `Updated disease "${updated.name}" (${updated.code}); active=${updated.isActive}`,
          before: {
            name: existing.name,
            code: existing.code,
            slug: existing.slug,
            isActive: existing.isActive,
          },
          after: {
            name: updated.name,
            code: updated.code,
            slug: updated.slug,
            isActive: updated.isActive,
          },
        },
        ipAddress: audit.ip,
        userAgent: audit.userAgent,
      });
    }

    return updated;
  }

  static async deleteDisease(
    id: number,
    audit?: {
      actorUserId: string;
      actorEmail: string | null;
      ip?: string | null;
      userAgent?: string | null;
    },
  ) {
    const existing = await prisma.disease.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Disease not found", 404);
    }

    await prisma.disease.delete({ where: { id } });

    if (audit) {
      await AuditService.append({
        action: "DISEASE_DELETED",
        actorUserId: audit.actorUserId,
        actorEmail: audit.actorEmail,
        resourceType: "Disease",
        resourceId: String(id),
        metadata: {
          summary: `Removed disease type "${existing.name}" (${existing.code}) from the catalog`,
          name: existing.name,
          code: existing.code,
        },
        ipAddress: audit.ip,
        userAgent: audit.userAgent,
      });
    }
  }
}
