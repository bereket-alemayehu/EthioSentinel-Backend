import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

export class DiseaseService {
  static async getAllDiseases() {
    return prisma.disease.findMany({
      orderBy: { name: "asc" },
    });
  }

  static async createDisease(data: {
    name?: string;
    slug?: string;
    description?: string;
    symptomProfile?: string;
    isActive?: boolean;
  }) {
    const { name, slug, description, symptomProfile, isActive } = data;

    if (!name || !slug) {
      throw new AppError("Name and slug are required", 400);
    }

    return prisma.disease.create({
      data: {
        name,
        slug,
        description,
        symptomProfile,
        isActive: isActive ?? true,
      },
    });
  }
}
