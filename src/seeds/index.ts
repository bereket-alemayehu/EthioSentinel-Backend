import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/password.util";
import { env } from "../config/env.config";

async function main() {
  console.log("Seeding database...");

  // 1. Create Regions
  const addisAbaba = await prisma.region.upsert({
    where: { code: "AA" },
    update: {},
    create: {
      name: "Addis Ababa",
      code: "AA",
      primaryLanguage: "AMHARIC",
    },
  });

  // 2. Create Districts
  await prisma.district.upsert({
    where: { code: "KIRKOS" },
    update: {},
    create: {
      name: "Kirkos",
      code: "KIRKOS",
      regionId: addisAbaba.id,
    },
  });

  // 3. Create Admin User
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: "admin@ethiosentinel.org" },
    update: {},
    create: {
      username: "system_admin",
      email: "admin@ethiosentinel.org",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      region: addisAbaba.name,
      clearanceLevel: 5,
    },
  });

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
