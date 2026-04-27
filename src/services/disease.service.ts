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
    code?: string;
    description?: string;
    symptomProfile?: string;
    isActive?: boolean;
  }) {
    const { name, slug, code, description, symptomProfile, isActive } = data;

    if (!name || !slug || !code) {
      throw new AppError("Name, slug, and code are required", 400);
    }

    return prisma.disease.create({
      data: {
        name,
        slug,
        code,
        description,
        symptomProfile,
        isActive: isActive ?? true,
      },
    });
  }
}
