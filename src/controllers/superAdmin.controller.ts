import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { catchAsync } from "../utils/catchAsync";
import { sendSuccess } from "../utils/response.util";
import { SuperAdminService } from "../services/superAdmin.service";
import { AppError } from "../utils/AppError";

const ROLE_VALUES = new Set<string>(Object.values(Role));

function auditReqMeta(req: Request) {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    null;
  return { ip, userAgent: req.get("user-agent") || null };
}

function parseActionsQuery(req: Request): string[] | undefined {
  const raw = req.query.actions;
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export class SuperAdminController {
  static getOverview = catchAsync(async (_req: Request, res: Response) => {
    const overview = await SuperAdminService.getOverview();
    return sendSuccess(res, overview, "Overview retrieved");
  });

  static listUsers = catchAsync(async (_req: Request, res: Response) => {
    const users = await SuperAdminService.listUsers();
    return sendSuccess(res, users, "Users retrieved");
  });

  static listAuditLogs = catchAsync(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const action =
      typeof req.query.action === "string" ? req.query.action : undefined;
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from =
      typeof fromRaw === "string" && fromRaw
        ? new Date(fromRaw)
        : undefined;
    const to = typeof toRaw === "string" && toRaw ? new Date(toRaw) : undefined;
    const actions = parseActionsQuery(req);

    if (req.query.format === "csv") {
      const result = await SuperAdminService.listAuditLogs({
        page: 1,
        limit: 5000,
        action,
        actions,
        from,
        to,
      });
      const rows = result.data;
      const header =
        "id,createdAt,action,actorUserId,actorUsername,actorEmail,resourceType,resourceId,ipAddress,userAgent,metadata\n";
      const body = rows
        .map((r) =>
          [
            r.id,
            r.createdAt.toISOString(),
            JSON.stringify(r.action),
            r.actorUserId ?? "",
            JSON.stringify((r as { actorUsername?: string | null }).actorUsername ?? ""),
            r.actorEmail ?? "",
            r.resourceType ?? "",
            r.resourceId ?? "",
            r.ipAddress ?? "",
            JSON.stringify(r.userAgent ?? ""),
            JSON.stringify(r.metadata ?? null),
          ].join(","),
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="audit-log.csv"',
      );
      return res.status(200).send(header + body);
    }

    const result = await SuperAdminService.listAuditLogs({
      page,
      limit,
      action,
      actions,
      from,
      to,
    });
    return sendSuccess(res, result, "Audit logs retrieved");
  });

  static createUser = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as {
      email?: string;
      password?: string;
      username?: string;
      role?: string;
      region?: string;
      assignedDistrict?: string | null;
      phoneNumber?: string | null;
      isActive?: boolean;
    };
    const r = String(body.role ?? "")
      .trim()
      .toUpperCase();
    if (!ROLE_VALUES.has(r)) {
      throw new AppError("Valid role is required", 400);
    }
    const role = r as Role;
    const created = await SuperAdminService.createUser(
      req.user!.id,
      {
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        username: String(body.username ?? ""),
        role,
        region: String(body.region ?? ""),
        assignedDistrict: body.assignedDistrict,
        phoneNumber: body.phoneNumber,
        isActive: body.isActive,
      },
      auditReqMeta(req),
    );
    return sendSuccess(res, created, "User created", 201);
  });

  static revokeUser = catchAsync(async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const result = await SuperAdminService.revokeUser(
      req.user!.id,
      targetId,
      auditReqMeta(req),
    );
    return sendSuccess(res, result, "User access revoked");
  });

  static updateUser = catchAsync(async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const body = req.body as {
      isActive?: boolean;
      role?: string;
      region?: string;
      assignedDistrict?: string | null;
      clearanceLevel?: number | null;
      username?: string;
      email?: string;
    };
    let role: Role | undefined;
    if (body.role !== undefined) {
      const r = String(body.role).toUpperCase();
      if (!ROLE_VALUES.has(r)) {
        throw new AppError("Invalid role", 400);
      }
      role = r as Role;
    }
    const hasUpdate =
      body.isActive !== undefined ||
      role !== undefined ||
      body.region !== undefined ||
      body.assignedDistrict !== undefined ||
      body.clearanceLevel !== undefined ||
      body.username !== undefined ||
      body.email !== undefined;
    if (!hasUpdate) {
      throw new AppError("No updates provided", 400);
    }
    const updated = await SuperAdminService.updateUser(
      req.user!.id,
      targetId,
      {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(body.region !== undefined ? { region: body.region } : {}),
        ...(body.assignedDistrict !== undefined
          ? { assignedDistrict: body.assignedDistrict }
          : {}),
        ...(body.clearanceLevel !== undefined
          ? { clearanceLevel: body.clearanceLevel }
          : {}),
        ...(body.username !== undefined ? { username: body.username } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
      },
      auditReqMeta(req),
    );
    return sendSuccess(res, updated, "User updated");
  });

  static resetPassword = catchAsync(async (req: Request, res: Response) => {
    const targetId = String(req.params.id);
    const newPassword = String(
      (req.body as { newPassword?: string }).newPassword ?? "",
    );
    const result = await SuperAdminService.resetUserPassword(
      req.user!.id,
      targetId,
      newPassword,
      auditReqMeta(req),
    );
    return sendSuccess(res, result, "Password reset; user must sign in again");
  });
}
