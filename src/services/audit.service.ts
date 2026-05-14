import { prisma } from "../lib/prisma";
import logger from "../utils/logger";
import type { Prisma } from "@prisma/client";

export type AuditAppendInput = {
  action: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class AuditService {
  /** Best-effort append; never throws to callers (logs on failure). */
  static async append(input: AuditAppendInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId ?? undefined,
          actorEmail: input.actorEmail ?? undefined,
          resourceType: input.resourceType ?? undefined,
          resourceId: input.resourceId ?? undefined,
          metadata: input.metadata ?? undefined,
          ipAddress: input.ipAddress ?? undefined,
          userAgent: input.userAgent ?? undefined,
        },
      });
    } catch (err) {
      logger.error("AuditLog append failed", { err, action: input.action });
    }
  }
}
