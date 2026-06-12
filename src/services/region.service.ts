import { prisma } from "../lib/prisma";
import {
  normalizeAddisAbabaDistrictList,
  normalizeRegionName,
} from "../utils/geo.util";

export class RegionService {
  static async getAllRegions() {
    const regions = await prisma.region.findMany({
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
          orderBy: { name: "asc" },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return regions.map((region) => {
      if (normalizeRegionName(region.name) !== "Addis Ababa") {
        return region;
      }
      return {
        ...region,
        districts: normalizeAddisAbabaDistrictList(region.districts),
      };
    });
  }
}
