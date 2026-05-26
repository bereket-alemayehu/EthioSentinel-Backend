import { prisma } from "../lib/prisma";

export class RegionService {
  static async getAllRegions() {
    return prisma.region.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        primaryLanguage: true,
        districts: {
          select: {
            id: true,
            name: true,
            code: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
