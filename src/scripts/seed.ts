import { Language, UserRole } from "../../generated/prisma/enums";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/auth";

async function main() {
  const passwordHash = await hashPassword(env.seedAdminPassword);

  const amhara = await prisma.region.upsert({
    where: { code: "AMH" },
    update: {},
    create: {
      name: "Amhara",
      code: "AMH",
      primaryLanguage: Language.AMHARIC,
    },
  });

  await prisma.district.upsert({
    where: { code: "BJR" },
    update: {},
    create: {
      name: "Bahir Dar",
      code: "BJR",
      regionId: amhara.id,
      latitude: 11.5936,
      longitude: 37.3908,
    },
  });

  const diseases = [
    {
      name: "Malaria",
      slug: "malaria",
      description: "Mosquito-borne infectious disease.",
      symptomProfile: "Fever, chills, headache, sweating",
    },
    {
      name: "Cholera",
      slug: "cholera",
      description:
        "Acute diarrheal infection caused by contaminated food or water.",
      symptomProfile: "Watery diarrhea, dehydration, vomiting",
    },
    {
      name: "Typhoid",
      slug: "typhoid",
      description:
        "Bacterial infection spread through contaminated food and water.",
      symptomProfile:
        "Fever, abdominal pain, weakness, constipation or diarrhea",
    },
  ];

  for (const disease of diseases) {
    await prisma.disease.upsert({
      where: { slug: disease.slug },
      update: disease,
      create: disease,
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@ethiosentinel.local" },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      regionId: amhara.id,
    },
    create: {
      fullName: "System Admin",
      email: "admin@ethiosentinel.local",
      passwordHash,
      role: UserRole.ADMIN,
      regionId: amhara.id,
    },
  });

  console.log("Seed completed successfully.");
  console.log("Admin login email: admin@ethiosentinel.local");
  console.log(`Admin login password: ${env.seedAdminPassword}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
