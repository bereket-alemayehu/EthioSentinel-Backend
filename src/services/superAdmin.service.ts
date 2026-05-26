import { prisma } from "../lib/prisma";
import { AdvisoryStatus, Role } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { hashPassword } from "../utils/password.util";
import { AuditService } from "./audit.service";

export class SuperAdminService {
  static async getOverview() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalReports,
      mortalityReports,
      pendingAlerts,
      totalAdvisories,
      draftAdvisories,
      totalAlerts,
      deliveredAlerts,
      anomalySignals,
      logins24h,
      failedLogins7d,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.diseaseReport.count(),
      prisma.diseaseReport.count({ where: { deathCount: { gt: 0 } } }),
      prisma.alert.count({ where: { isDelivered: false } }),
      prisma.advisory.count(),
      prisma.advisory.count({ where: { status: AdvisoryStatus.DRAFT } }),
      prisma.alert.count(),
      prisma.alert.count({ where: { isDelivered: true } }),
      prisma.anomalySignal.count(),
      prisma.auditLog.count({
        where: {
          action: "AUTH_LOGIN_SUCCESS",
          createdAt: { gte: since24h },
        },
      }),
      prisma.auditLog.count({
        where: {
          action: "AUTH_LOGIN_FAILURE",
          createdAt: { gte: since7d },
        },
      }),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalReports,
      mortalityReports,
      pendingAlerts,
      totalAdvisories,
      draftAdvisories,
      totalAlerts,
      deliveredAlerts,
      anomalySignals,
      logins24h,
      failedLogins7d,
    };
  }

  static async listUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        region: true,
        assignedDistrict: true,
        healthFacilityId: true,
        clearanceLevel: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async listAuditLogs(params: {
    page: number;
    limit: number;
    action?: string;
    actions?: string[];
    from?: Date;
    to?: Date;
  }) {
    const { page, limit, action, actions, from, to } = params;
    const skip = (page - 1) * limit;
    const actionFilter =
      actions && actions.length > 0
        ? { in: actions }
        : action
          ? action
          : undefined;
    const where = {
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          actorUserId: true,
          actorEmail: true,
          action: true,
          resourceType: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const actorIds = [
      ...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id))),
    ];
    const actors =
      actorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, username: true, email: true },
          })
        : [];
    const actorById = new Map(actors.map((u) => [u.id, u]));

    const enriched = rows.map((r) => {
      const u = r.actorUserId ? actorById.get(r.actorUserId) : undefined;
      return {
        ...r,
        actorUsername: u?.username ?? null,
        actorDisplayEmail: u?.email ?? r.actorEmail ?? null,
      };
    });

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private static async countActiveSuperAdmins(excludeUserId?: string) {
    return prisma.user.count({
      where: {
        role: Role.SUPER_ADMIN,
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    });
  }

  static async updateUser(
    actorId: string,
    targetUserId: string,
    data: {
      isActive?: boolean;
      role?: Role;
      region?: string;
      assignedDistrict?: string | null;
      clearanceLevel?: number | null;
      username?: string;
      email?: string;
    },
    auditMeta: { ip?: string | null; userAgent?: string | null },
  ) {
    const hasField =
      data.isActive !== undefined ||
      data.role !== undefined ||
      data.region !== undefined ||
      data.assignedDistrict !== undefined ||
      data.clearanceLevel !== undefined ||
      data.username !== undefined ||
      data.email !== undefined;
    if (!hasField) {
      throw new AppError("No updates provided", 400);
    }

    if (actorId === targetUserId && data.role && data.role !== Role.SUPER_ADMIN) {
      throw new AppError("You cannot demote your own super admin role", 400);
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new AppError("User not found", 404);
    }

    if (data.email !== undefined) {
      const nextEmail = String(data.email).trim().toLowerCase();
      if (!nextEmail) {
        throw new AppError("Email cannot be empty", 400);
      }
      const clash = await prisma.user.findFirst({
        where: { email: nextEmail, id: { not: targetUserId } },
      });
      if (clash) {
        throw new AppError("Email already in use", 409);
      }
    }

    if (data.username !== undefined) {
      const nextUsername = String(data.username).trim();
      if (!nextUsername) {
        throw new AppError("Username cannot be empty", 400);
      }
    }

    const becomesInactiveOrNotSuper =
      (data.isActive === false && target.role === Role.SUPER_ADMIN) ||
      (data.role !== undefined &&
        data.role !== Role.SUPER_ADMIN &&
        target.role === Role.SUPER_ADMIN);

    if (becomesInactiveOrNotSuper) {
      const others = await this.countActiveSuperAdmins(targetUserId);
      if (others === 0) {
        throw new AppError(
          "Cannot remove or demote the last active super admin",
          400,
        );
      }
    }

    const before = {
      username: target.username,
      email: target.email,
      role: target.role,
      isActive: target.isActive,
      region: target.region,
      assignedDistrict: target.assignedDistrict,
      clearanceLevel: target.clearanceLevel,
    };

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.assignedDistrict !== undefined
          ? { assignedDistrict: data.assignedDistrict }
          : {}),
        ...(data.clearanceLevel !== undefined
          ? { clearanceLevel: data.clearanceLevel }
          : {}),
        ...(data.username !== undefined
          ? { username: String(data.username).trim() }
          : {}),
        ...(data.email !== undefined
          ? { email: String(data.email).trim().toLowerCase() }
          : {}),
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        region: true,
        assignedDistrict: true,
        clearanceLevel: true,
        updatedAt: true,
      },
    });

    const summaryParts: string[] = [];
    if (data.role !== undefined && data.role !== before.role) {
      summaryParts.push(`role ${before.role} → ${data.role}`);
    }
    if (data.isActive !== undefined && data.isActive !== before.isActive) {
      summaryParts.push(data.isActive ? "account activated" : "account suspended");
    }
    if (data.email !== undefined && data.email !== before.email) {
      summaryParts.push("email updated");
    }
    if (data.username !== undefined && data.username !== before.username) {
      summaryParts.push("username updated");
    }
    if (data.region !== undefined && data.region !== before.region) {
      summaryParts.push("region updated");
    }

    await AuditService.append({
      action: "USER_UPDATED_BY_SUPER_ADMIN",
      actorUserId: actorId,
      resourceType: "User",
      resourceId: targetUserId,
      metadata: {
        summary:
          summaryParts.length > 0
            ? `Super admin updated ${target.email}: ${summaryParts.join("; ")}`
            : `Super admin updated profile fields for ${target.email}`,
        before,
        changes: data,
        after: {
          username: updated.username,
          email: updated.email,
          role: updated.role,
          isActive: updated.isActive,
          region: updated.region,
          assignedDistrict: updated.assignedDistrict,
          clearanceLevel: updated.clearanceLevel,
        },
      },
      ipAddress: auditMeta.ip,
      userAgent: auditMeta.userAgent,
    });

    return updated;
  }

  static async resetUserPassword(
    actorId: string,
    targetUserId: string,
    newPassword: string,
    auditMeta: { ip?: string | null; userAgent?: string | null },
  ) {
    if (newPassword.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new AppError("User not found", 404);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });

    await AuditService.append({
      action: "SUPER_ADMIN_PASSWORD_RESET",
      actorUserId: actorId,
      resourceType: "User",
      resourceId: targetUserId,
      metadata: {
        summary: `Password reset for ${target.email} (${target.username}); sessions invalidated`,
        targetEmail: target.email,
        targetUsername: target.username,
      },
      ipAddress: auditMeta.ip,
      userAgent: auditMeta.userAgent,
    });

    return { ok: true };
  }

  static async createUser(
    actorId: string,
    input: {
      email: string;
      password: string;
      username: string;
      role: Role;
      region: string;
      assignedDistrict?: string | null;
      healthFacilityId?: number | null;
      phoneNumber?: string | null;
      isActive?: boolean;
    },
    auditMeta: { ip?: string | null; userAgent?: string | null },
  ) {
    const email = String(input.email).trim().toLowerCase();
    const password = String(input.password);
    const username = String(input.username).trim();
    const region = String(input.region).trim();

    if (!email || !password || !username) {
      throw new AppError("email, password, and username are required", 400);
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const healthFacilityId =
      typeof input.healthFacilityId === "number" && Number.isFinite(input.healthFacilityId)
        ? Math.trunc(input.healthFacilityId)
        : null;

    let healthFacility: { id: number; Region: string; Woreda: string; ownerId: string | null } | null = null;
    if (input.role === Role.HEW) {
      if (!healthFacilityId) {
        throw new AppError("Select a health center for HEW accounts", 400);
      }
      healthFacility = await prisma.healthFacility.findUnique({
        where: { id: healthFacilityId },
        select: { id: true, Region: true, Woreda: true, ownerId: true },
      });
      if (!healthFacility) {
        throw new AppError("Health center not found", 404);
      }
      if (healthFacility.ownerId) {
        throw new AppError("Selected health center is already assigned to a user", 409);
      }
    } else if (!region) {
      throw new AppError("region is required", 400);
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new AppError("Email already in use", 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: input.role,
        region:
          input.role === Role.HEW && healthFacility
            ? healthFacility.Region
            : region,
        assignedDistrict:
          input.role === Role.HEW && healthFacility
            ? healthFacility.Woreda.trim() || null
            : input.assignedDistrict?.trim() || null,
          healthFacilityId: healthFacility?.id ?? null,
        phoneNumber: input.phoneNumber?.trim() || null,
        isActive: input.isActive !== false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        region: true,
        assignedDistrict: true,
        healthFacilityId: true,
        clearanceLevel: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (input.role === Role.HEW && healthFacility) {
      await prisma.healthFacility.update({
        where: { id: healthFacility.id },
        data: { ownerId: user.id },
      });
    }

    await AuditService.append({
      action: "USER_CREATED_BY_SUPER_ADMIN",
      actorUserId: actorId,
      resourceType: "User",
      resourceId: user.id,
      metadata: {
        summary: `New account ${user.email} as ${user.role} in ${user.region}`,
        email: user.email,
        role: user.role,
        region: user.region,
        healthFacilityId: healthFacility?.id ?? null,
        healthCenter: healthFacility ? `${healthFacility.Region} / ${healthFacility.Woreda}` : null,
      },
      ipAddress: auditMeta.ip,
      userAgent: auditMeta.userAgent,
    });

    return user;
  }

  /** Soft-remove: deactivates the user and invalidates all sessions. */
  static async revokeUser(
    actorId: string,
    targetUserId: string,
    auditMeta: { ip?: string | null; userAgent?: string | null },
  ) {
    if (actorId === targetUserId) {
      throw new AppError("You cannot remove your own account", 400);
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new AppError("User not found", 404);
    }

    if (target.role === Role.SUPER_ADMIN && target.isActive) {
      const others = await this.countActiveSuperAdmins(targetUserId);
      if (others === 0) {
        throw new AppError("Cannot remove the last active super admin", 400);
      }
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        isActive: false,
        tokenVersion: { increment: 1 },
      },
    });

    await AuditService.append({
      action: "USER_REVOKED_BY_SUPER_ADMIN",
      actorUserId: actorId,
      resourceType: "User",
      resourceId: targetUserId,
      metadata: {
        summary: `Access revoked for ${target.email} (${target.username}); all sessions ended`,
        previousRole: target.role,
      },
      ipAddress: auditMeta.ip,
      userAgent: auditMeta.userAgent,
    });

    return { ok: true };
  }
}
