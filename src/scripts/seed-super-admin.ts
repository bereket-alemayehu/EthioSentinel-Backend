/**
 * Upserts the governance super admin user only (no regions/diseases/reports).
 * Use when full `npm run seed` fails or you only need super admin credentials.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const password =
    process.env.SEED_SUPER_ADMIN_PASSWORD || "SuperAdmin@12345";
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: "superadmin@ethiosentinel.org" },
    update: {
      passwordHash: hash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      username: "super_admin",
      email: "superadmin@ethiosentinel.org",
      passwordHash: hash,
      role: Role.SUPER_ADMIN,
      region: "Addis Ababa",
      clearanceLevel: 10,
      isActive: true,
    },
  });

  console.log("Super admin ready: superadmin@ethiosentinel.org");
  console.log("Password from SEED_SUPER_ADMIN_PASSWORD or default SuperAdmin@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
