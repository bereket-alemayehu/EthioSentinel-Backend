import { prisma } from "../lib/prisma";

export class HealthService {
  static async checkHealth() {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "EthioHealthSentinel API",
      database: "connected",
      timestamp: new Date().toISOString(),
    };
  }
}
