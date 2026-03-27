import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

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
  const passwordHash = await bcrypt.hash("Admin@12345", 10);
  await prisma.user.upsert({
    where: { email: "admin@ethiosentinel.org" },
    update: {},
    create: {
      fullName: "System Admin",
      email: "admin@ethiosentinel.org",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      regionId: addisAbaba.id,
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
