import { prisma } from "../lib/prisma";

export class RegionService {
  static async getAllRegions() {
    return prisma.region.findMany({
      include: {
        districts: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
