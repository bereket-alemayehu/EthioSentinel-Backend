import {
  AnomalyClassification,
  AnomalyMethod,
  Language,
  Role,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import { seedDiseases } from "./seed-diseases";
import healthcenter, { seedHealthCenters } from "./seed.healthcenter";


type DistrictSeed = {
  name: string;
  code: string;
  latitude: number | null;
  longitude: number | null;
};

type RegionSeed = {
  name: string;
  code: string;
  primaryLanguage: Language;
  districts: DistrictSeed[];
};

// Build regions/districts dynamically from the real health center seed data
function slugCode(name: string, max = 4) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, max)
    .toUpperCase();
}

function buildRegionsFromHealthCenter(): RegionSeed[] {
  const map = new Map<string, { name: string; code: string; primaryLanguage: Language; districts: Map<string, DistrictSeed> }>();

  for (const item of (healthcenter as any[])) {
    const regionName = (item.Region || "").toString().trim();
    if (!regionName) continue;
    const woreda = (item.Woreda || "").toString().trim();
    const y = Number(item.Y);
    const x = Number(item.X);

    if (!map.has(regionName)) {
      map.set(regionName, { name: regionName, code: slugCode(regionName, 4), primaryLanguage: Language.AMHARIC, districts: new Map() });
    }

    if (woreda) {
      const region = map.get(regionName)!;
      if (!region.districts.has(woreda)) {
        const districtCode = `${region.code}-${slugCode(woreda, 3)}`;
        region.districts.set(woreda, {
          name: woreda,
          code: districtCode,
          latitude: Number.isFinite(y) && y >= -90 && y <= 90 ? y : null,
          longitude: Number.isFinite(x) && x >= -180 && x <= 180 ? x : null,
        });
      }
    }
  }

  return Array.from(map.values()).map((r) => ({ name: r.name, code: r.code, primaryLanguage: r.primaryLanguage, districts: Array.from(r.districts.values()) }));
}

const ethiopiaRegions: RegionSeed[] = buildRegionsFromHealthCenter();

async function seedRegionsAndDistricts() {
  for (const region of ethiopiaRegions) {
    const existingRegionByName = await prisma.region.findUnique({
      where: { name: region.name },
    });

    const savedRegion = existingRegionByName
      ? await prisma.region.update({
          where: { id: existingRegionByName.id },
          data: {
            code: region.code,
            primaryLanguage: region.primaryLanguage,
          },
        })
      : await prisma.region.upsert({
          where: { code: region.code },
          update: {
            name: region.name,
            primaryLanguage: region.primaryLanguage,
          },
          create: {
            name: region.name,
            code: region.code,
            primaryLanguage: region.primaryLanguage,
          },
        });

    for (const district of region.districts) {
      const existingDistrictByCode = await prisma.district.findUnique({
        where: { code: district.code },
      });

      const existingDistrictByRegionAndName = await prisma.district.findFirst({
        where: {
          regionId: savedRegion.id,
          name: district.name,
        },
      });

      if (existingDistrictByCode) {
        await prisma.district.update({
          where: { id: existingDistrictByCode.id },
          data: {
            name: district.name,
            regionId: savedRegion.id,
            latitude: district.latitude ?? null,
            longitude: district.longitude ?? null,
          },
        });
        continue;
      }

      if (existingDistrictByRegionAndName) {
        await prisma.district.update({
          where: { id: existingDistrictByRegionAndName.id },
          data: {
            code: district.code,
            latitude: district.latitude ?? null,
            longitude: district.longitude ?? null,
          },
        });
        continue;
      }

      await prisma.district.create({
        data: {
          name: district.name,
          code: district.code,
          regionId: savedRegion.id,
          latitude: district.latitude ?? null,
          longitude: district.longitude ?? null,
        },
      });
    }
  }
}

async function seedUsers() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const hewPassword = "Hew@12345";
  const superAdminPassword =
    process.env.SEED_SUPER_ADMIN_PASSWORD || "SuperAdmin@12345";

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const hewHash = await bcrypt.hash(hewPassword, 10);
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

  // Seed Admin
  await prisma.user.upsert({
    where: { email: "admin@ethiosentinel.com" },
    update: {
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
    create: {
      username: "admin",
      email: "admin@ethiosentinel.com",
      passwordHash: adminHash,
      role: Role.ADMIN,
      region: "Addis Ababa",
    },
  });

  // Seed HEW
  await prisma.user.upsert({
    where: { email: "hew@ethiosentinel.com" },
    update: {
      passwordHash: hewHash,
      role: Role.HEW,
    },
    create: {
      username: "HEW Professional",
      email: "hew@ethiosentinel.com",
      passwordHash: hewHash,
      role: Role.HEW,
      region: "Addis Ababa",
      assignedDistrict: "Bole",
    },
  });

  // Seed Super Admin (governance: /super-admin UI, audit logs, user admin)
  await prisma.user.upsert({
    where: { email: "superadmin@ethiosentinel.org" },
    update: {
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      username: "super_admin",
      email: "superadmin@ethiosentinel.org",
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      region: "Addis Ababa",
      clearanceLevel: 10,
      isActive: true,
    },
  });
}

async function seedReports() {
  const diseases = ["Malaria", "Cholera", "Dengue", "Measles","Ebola","HIV/AIDS"];
  const districts = await prisma.district.findMany({ take: 10 });
  const user = await prisma.user.findFirst({ where: { role: Role.HEW } });

  if (!user) return;

  console.log("🌱 Seeding reports...");

  for (const district of districts) {
    for (const disease of diseases) {
      const caseCount = Math.floor(Math.random() * 200);
      const deathCount = Math.floor(caseCount * 0.05);

      await prisma.diseaseReport.create({
        data: {
          district: district.name,
          diseaseType: disease,
          reporterId: user.id,
          caseCount,
          deathCount,
          status: "VERIFIED",
          notes: `Simulated ${disease} report for ${district.name}`,
        },
      });
    }
  }
}

async function seedAlerts() {
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  // Include districts in the fetch so we can link them
  const regions = await prisma.region.findMany({ 
    take: 3,
    include: { districts: true }
  });
  
  if (!admin || regions.length === 0) {
    console.log("⚠️ Skipping alert seeding: Admin or Regions not found.");
    return;
  }

  console.log("🌱 Seeding alerts for approval...");

  // Clear existing alerts to avoid duplicates
  await prisma.alert.deleteMany({});

  const sampleAlerts = [
    {
      targetZone: "Addis Ababa",
      title: "Malaria Outbreak Warning",
      message: "Increased malaria cases detected in Addis Ababa. Please take precautions.",
      severity: "HIGH" as const,
      disease: "Malaria",
      status: "Awaiting Review",
      advisoryContent: "Use bed nets, clear standing water, and seek medical attention if fever persists."
    },
    {
      targetZone: "Dire Dawa",
      title: "Cholera Alert",
      message: "Suspected cholera spike in Dire Dawa. Ensure water is boiled.",
      severity: "CRITICAL" as const,
      disease: "Cholera",
      status: "Approved",
      advisoryContent: "Wash hands frequently, use treated water, and report symptoms immediately."
    },
    {
      targetZone: "Gondar",
      title: "Measles Notification",
      message: "Measles cases among children rising in Gondar.",
      severity: "MEDIUM" as const,
      disease: "Measles",
      status: "Awaiting Review",
      advisoryContent: "Vaccination drive starting Monday. Keep children home if they show rash or fever."
    }
  ];

  for (const a of sampleAlerts) {
    const region = regions[Math.floor(Math.random() * regions.length)];
    const district = region.districts && region.districts.length > 0 ? region.districts[0] : null;

    // 1. Create a linked Advisory Draft
    const advisory = await prisma.advisory.create({
      data: {
        title: `${a.disease} Health Advisory: ${a.targetZone}`,
        content: a.advisoryContent,
        diseaseType: a.disease,
        regionId: region.id,
        districtId: district?.id || null,
        language: "ENGLISH",
        status: a.status === "Approved" ? "APPROVED" : "DRAFT",
        riskLevel: a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "HIGH" ? "HIGH" : "MODERATE",
        generatedByAI: true
      }
    });

    // 2. Create the Alert
    await prisma.alert.create({
      data: {
        targetZone: a.targetZone,
        title: a.title,
        message: a.message,
        severity: a.severity,
        channel: "WEB",
        isDelivered: a.status === "Approved",
        advisoryId: advisory.id,
        aiSuggested: true
      }
    });
  }

  console.log("Seeding alerts and advisories complete.");
}

/** Recent reports + anomaly rows so Admin → Anomaly Analysis chart/table/map have data. */
async function seedAnomalyDemoData() {
  const hew = await prisma.user.findFirst({ where: { role: Role.HEW } });
  if (!hew) {
    console.log("⚠️ Skipping anomaly demo: no HEW user.");
    return;
  }

  const targets: Array<{ district: string; diseaseType: string }> = [
    { district: "Bole", diseaseType: "Malaria" },
    { district: "Arada", diseaseType: "Cholera" },
    { district: "Yeka", diseaseType: "Dengue" },
  ];

  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 40);

  for (const t of targets) {
    for (let day = 0; day < 28; day++) {
      const ts = new Date(now);
      ts.setUTCDate(ts.getUTCDate() - day);
      ts.setUTCHours(12, 0, 0, 0);
      const base = 18 + (day % 9) * 3;
      await prisma.diseaseReport.create({
        data: {
          district: t.district,
          diseaseType: t.diseaseType,
          reporterId: hew.id,
          caseCount: day === 4 ? base + 95 : base,
          deathCount: 0,
          status: "VERIFIED",
          timestamp: ts,
          notes: `Demo seed — ${t.district} / ${t.diseaseType}`,
        },
      });
    }

    await prisma.anomalySignal.create({
      data: {
        district: t.district,
        diseaseType: t.diseaseType,
        currentCases: 130,
        historicalMean: 48,
        stdDev: 11,
        zScore: 3.45,
        classification: AnomalyClassification.ANOMALY,
        method: AnomalyMethod.ZSCORE,
        sampleSize: 28,
        lookbackStart,
        lookbackEnd: now,
        manual: false,
      },
    });
  }

  console.log("✅ Seeded anomaly demo data (time-series reports + ANOMALY signals)");
}

async function main() {
  await seedDiseases();
  console.log("✅ Seeded master diseases list");

  await seedRegionsAndDistricts();
  console.log("✅ Seeded Ethiopia regions and districts");

  await seedUsers();
  console.log("✅ Seeded Admin and HEW users");

  await seedHealthCenters();
  console.log("✅ Seeded health facilities from real data");

  await seedReports();
  console.log("✅ Seeded sample disease reports");

  await seedAlerts();
  console.log("✅ Seeded sample alerts for approval");

  await seedAnomalyDemoData();
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
