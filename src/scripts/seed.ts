import {
  AnomalyClassification,
  AnomalyMethod,
  Language,
  Role,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { seedDiseases } from "./seed-diseases";
import healthcenter, { seedHealthCenters } from "./seed.healthcenter";
import {
  ADDIS_ABABA_SUB_CITIES,
  ADDIS_ABABA_SUB_CITY_COORDS,
  normalizeRegionName,
  resolveDistrictName,
} from "../utils/geo.util";

type DistrictSeed = {
  name: string;
  code: string;
  latitude: number | null;
  longitude: number | null;
  coordSamples?: number;
};

type RegionSeed = {
  name: string;
  code: string;
  primaryLanguage: Language;
  districts: DistrictSeed[];
};

// Build regions/districts dynamically from the real health center seed data
function slugCode(name: string, max = 4) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
  return cleaned.slice(0, max) || "UNK";
}

function hashSuffix(input: string, size = 4) {
  return crypto
    .createHash("md5")
    .update(input)
    .digest("hex")
    .slice(0, size)
    .toUpperCase();
}

function normalizeRegionNameLocal(raw: string) {
  return normalizeRegionName(raw);
}

function buildRegionsFromHealthCenter(): RegionSeed[] {
  const map = new Map<
    string,
    {
      name: string;
      code: string;
      primaryLanguage: Language;
      districts: Map<string, DistrictSeed>;
    }
  >();

  for (const item of healthcenter as any[]) {
    const regionName = normalizeRegionNameLocal((item.Region || "").toString());
    if (!regionName) continue;
    const zone = (item.Zone || "").toString();
    const woreda = (item.Woreda || "").toString();
    const districtName = resolveDistrictName(regionName, zone, woreda);
    const y = Number(item.Y);
    const x = Number(item.X);

    if (!map.has(regionName)) {
      map.set(regionName, {
        name: regionName,
        code: slugCode(regionName, 4),
        primaryLanguage: Language.AMHARIC,
        districts: new Map(),
      });
    }

    if (districtName) {
      const region = map.get(regionName)!;
      const hasCoords =
        Number.isFinite(y) &&
        Number.isFinite(x) &&
        y >= 3 &&
        y <= 15.5 &&
        x >= 33 &&
        x <= 48.5;
      const existing = region.districts.get(districtName);
      if (!existing) {
        const districtCode = `${region.code}-${slugCode(districtName, 12)}-${hashSuffix(`${region.name}:${districtName}`)}`;
        region.districts.set(districtName, {
          name: districtName,
          code: districtCode,
          latitude: hasCoords ? y : null,
          longitude: hasCoords ? x : null,
          coordSamples: hasCoords ? 1 : 0,
        });
      } else if (hasCoords) {
        const samples = (existing.coordSamples ?? 0) + 1;
        const prevLat = existing.latitude ?? y;
        const prevLon = existing.longitude ?? x;
        existing.latitude = prevLat + (y - prevLat) / samples;
        existing.longitude = prevLon + (x - prevLon) / samples;
        existing.coordSamples = samples;
      }
    }
  }

  return Array.from(map.values()).map((r) => {
    let districts = Array.from(r.districts.values()).map(({ coordSamples: _s, ...district }) => district);

    if (r.name === "Addis Ababa") {
      const byName = new Map(districts.map((district) => [district.name, district]));
      districts = ADDIS_ABABA_SUB_CITIES.map((name) => {
        const existing = byName.get(name);
        if (existing) return existing;
        const fallback = ADDIS_ABABA_SUB_CITY_COORDS[name];
        return {
          name,
          code: `${r.code}-${slugCode(name, 12)}-${hashSuffix(`${r.name}:${name}`)}`,
          latitude: fallback.latitude,
          longitude: fallback.longitude,
        };
      });
    }

    return {
      name: r.name,
      code: r.code,
      primaryLanguage: r.primaryLanguage,
      districts,
    };
  });
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

// async function seedReports() {
//   const diseases = ["Malaria", "Cholera", "Dengue", "Measles","Ebola","HIV/AIDS"];
//   const districts = await prisma.district.findMany({ take: 10 });
//   const user = await prisma.user.findFirst({ where: { role: Role.HEW } });

//   if (!user) return;

//   console.log("🌱 Seeding reports...");

//   for (const district of districts) {
//     for (const disease of diseases) {
//       const caseCount = Math.floor(Math.random() * 200);
//       const deathCount = Math.floor(caseCount * 0.05);

//       await prisma.diseaseReport.create({
//         data: {
//           district: district.name,
//           diseaseType: disease,
//           reporterId: user.id,
//           caseCount,
//           deathCount,
//           status: "VERIFIED",
//           notes: `Simulated ${disease} report for ${district.name}`,
//         },
//       });
//     }
//   }
// }

async function seedAlerts() {
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  // Include districts in the fetch so we can link them
  const regions = await prisma.region.findMany({
    take: 3,
    include: { districts: true },
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
      message:
        "Increased malaria cases detected in Addis Ababa. Please take precautions.",
      severity: "HIGH" as const,
      disease: "Malaria",
      status: "Awaiting Review",
      advisoryContent:
        "Use bed nets, clear standing water, and seek medical attention if fever persists.",
    },
    {
      targetZone: "Dire Dawa",
      title: "Cholera Alert",
      message: "Suspected cholera spike in Dire Dawa. Ensure water is boiled.",
      severity: "CRITICAL" as const,
      disease: "Cholera",
      status: "Approved",
      advisoryContent:
        "Wash hands frequently, use treated water, and report symptoms immediately.",
    },
    {
      targetZone: "Gondar",
      title: "Measles Notification",
      message: "Measles cases among children rising in Gondar.",
      severity: "MEDIUM" as const,
      disease: "Measles",
      status: "Awaiting Review",
      advisoryContent:
        "Vaccination drive starting Monday. Keep children home if they show rash or fever.",
    },
  ];

  for (const a of sampleAlerts) {
    const region = regions[Math.floor(Math.random() * regions.length)];
    const district =
      region.districts && region.districts.length > 0
        ? region.districts[0]
        : null;

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
        riskLevel:
          a.severity === "CRITICAL"
            ? "CRITICAL"
            : a.severity === "HIGH"
              ? "HIGH"
              : "MODERATE",
        generatedByAI: true,
      },
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
        aiSuggested: true,
      },
    });
  }

  console.log("Seeding alerts and advisories complete.");
}

async function seedAradaCriticalAlert() {
  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (!admin) {
    console.log("⚠️ Skipping Arada critical alert seed: no ADMIN user.");
    return;
  }

  const addisAbaba = await prisma.region.findFirst({
    where: { name: { equals: "Addis Ababa", mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const aradaDistrict = await prisma.district.findFirst({
    where: { name: { equals: "Arada", mode: "insensitive" } },
    select: { id: true, name: true },
  });

  if (!addisAbaba) {
    console.log(
      "⚠️ Skipping Arada critical alert seed: Addis Ababa region not found.",
    );
    return;
  }

  const advisoryTitle = "Critical Malaria Situation in Arada";
  const alertTitle = "CRITICAL ALERT: Malaria surge in Addis Ababa - Arada";
  const alertMessage =
    "A critical malaria surge has been detected in Arada district, Addis Ababa. " +
    "Residents should use treated bed nets, avoid stagnant water exposure, and seek immediate care for fever, chills, or severe headache. " +
    "Health teams are increasing surveillance and response in the area.";
  const advisoryContent = [
    "Disease: Malaria",
    "",
    "Situation summary:",
    "Arada district has recorded a sharp rise in suspected and confirmed malaria cases over a short period.",
    "Urgent community action is required to prevent further transmission.",
    "",
    "What residents should do now:",
    "- Sleep under insecticide-treated bed nets every night.",
    "- Remove standing water around homes and compounds.",
    "- Wear protective clothing in the evening and early morning.",
    "- Visit the nearest health facility immediately if fever or chills develop.",
    "",
    "Priority groups:",
    "- Children under 5",
    "- Pregnant women",
    "- Elderly residents and people with chronic illness",
    "",
    "Emergency signs requiring urgent medical attention:",
    "- Persistent high fever",
    "- Confusion or convulsions",
    "- Vomiting, weakness, or inability to drink fluids",
  ].join("\n");

  await prisma.alert.deleteMany({
    where: {
      title: alertTitle,
      targetZone: "Arada",
      aiSuggested: true,
    },
  });

  const advisory = await prisma.advisory.create({
    data: {
      title: advisoryTitle,
      content: advisoryContent,
      diseaseType: "Malaria",
      regionId: addisAbaba.id,
      districtId: aradaDistrict?.id ?? null,
      language: Language.ENGLISH,
      status: "APPROVED",
      riskLevel: "CRITICAL",
      generatedByAI: true,
    },
  });

  await prisma.alert.create({
    data: {
      targetZone: "Arada",
      title: alertTitle,
      message: alertMessage,
      severity: "CRITICAL",
      channel: "WEB",
      isDelivered: true,
      advisoryId: advisory.id,
      createdById: admin.id,
      aiSuggested: true,
    },
  });

  console.log("✅ Seeded CRITICAL alert + advisory for Addis Ababa / Arada");
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

  console.log(
    "✅ Seeded anomaly demo data (time-series reports + ANOMALY signals)",
  );
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

  // await seedReports();
  // console.log("✅ Seeded sample disease reports");

  // await seedAlerts();
  // console.log("✅ Seeded sample alerts for approval");

  await seedAradaCriticalAlert();

  // await seedAnomalyDemoData();
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
