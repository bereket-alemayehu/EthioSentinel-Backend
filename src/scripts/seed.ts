import { Language, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

type DistrictSeed = {
  name: string;
  code: string;
  latitude: number;
  longitude: number;
};

type RegionSeed = {
  name: string;
  code: string;
  primaryLanguage: Language;
  districts: DistrictSeed[];
};

const ethiopiaRegions: RegionSeed[] = [
  {
    name: "Addis Ababa",
    code: "AA",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Arada", code: "AA-AR", latitude: 9.0392, longitude: 38.7468 },
      { name: "Bole", code: "AA-BO", latitude: 8.9985, longitude: 38.7873 },
      { name: "Yeka", code: "AA-YE", latitude: 9.0301, longitude: 38.8096 },
      { name: "Lideta", code: "AA-LI", latitude: 9.0234, longitude: 38.7354 },
    ],
  },
  {
    name: "Dire Dawa",
    code: "DD",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Addis Ketema",
        code: "DD-AK",
        latitude: 9.5922,
        longitude: 41.8661,
      },
      { name: "Sabian", code: "DD-SA", latitude: 9.6011, longitude: 41.8613 },
      { name: "Kezira", code: "DD-KE", latitude: 9.5902, longitude: 41.8537 },
      {
        name: "Melka Jebdu",
        code: "DD-MJ",
        latitude: 9.5788,
        longitude: 41.8639,
      },
    ],
  },
  {
    name: "Afar",
    code: "AF",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Awsi Rasu",
        code: "AF-AR",
        latitude: 11.5684,
        longitude: 40.7897,
      },
      {
        name: "Gabi Rasu",
        code: "AF-GR",
        latitude: 11.7362,
        longitude: 41.0851,
      },
      {
        name: "Kilbati Rasu",
        code: "AF-KR",
        latitude: 13.2175,
        longitude: 40.1525,
      },
      { name: "Zone 3", code: "AF-Z3", latitude: 10.9942, longitude: 40.1164 },
    ],
  },
  {
    name: "Amhara",
    code: "AM",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Bahir Dar Zuria",
        code: "AM-BZ",
        latitude: 11.598,
        longitude: 37.3832,
      },
      {
        name: "Gondar Zuria",
        code: "AM-GZ",
        latitude: 12.603,
        longitude: 37.4688,
      },
      {
        name: "Dessie Zuria",
        code: "AM-DZ",
        latitude: 11.1296,
        longitude: 39.6279,
      },
      {
        name: "Debre Birhan",
        code: "AM-DB",
        latitude: 9.6795,
        longitude: 39.5326,
      },
    ],
  },
  {
    name: "Benishangul-Gumuz",
    code: "BG",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Assosa", code: "BG-AS", latitude: 10.0672, longitude: 34.5333 },
      { name: "Bambasi", code: "BG-BA", latitude: 9.7472, longitude: 34.7281 },
      { name: "Kamashi", code: "BG-KA", latitude: 9.5317, longitude: 35.8664 },
      { name: "Metekel", code: "BG-ME", latitude: 11.4088, longitude: 36.1137 },
    ],
  },
  {
    name: "Central Ethiopia",
    code: "CE",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Hossana", code: "CE-HO", latitude: 7.5521, longitude: 37.8497 },
      { name: "Welkite", code: "CE-WE", latitude: 8.2812, longitude: 37.7764 },
      { name: "Butajira", code: "CE-BU", latitude: 8.1229, longitude: 38.3698 },
      { name: "Durame", code: "CE-DU", latitude: 7.2405, longitude: 37.8918 },
    ],
  },
  {
    name: "Gambela",
    code: "GA",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Gambela Town",
        code: "GA-GT",
        latitude: 8.2501,
        longitude: 34.5891,
      },
      { name: "Abobo", code: "GA-AB", latitude: 7.8793, longitude: 34.4568 },
      { name: "Itang", code: "GA-IT", latitude: 8.2142, longitude: 34.2414 },
      { name: "Lare", code: "GA-LA", latitude: 8.5191, longitude: 34.2783 },
    ],
  },
  {
    name: "Harari",
    code: "HA",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Harar Town",
        code: "HA-HT",
        latitude: 9.3126,
        longitude: 42.1218,
      },
      { name: "Amir Nur", code: "HA-AN", latitude: 9.3135, longitude: 42.1272 },
      { name: "Aboker", code: "HA-AB", latitude: 9.3201, longitude: 42.1138 },
      { name: "Jinela", code: "HA-JI", latitude: 9.3004, longitude: 42.1365 },
    ],
  },
  {
    name: "Oromia",
    code: "OR",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Adama", code: "OR-AD", latitude: 8.5409, longitude: 39.2689 },
      { name: "Jimma", code: "OR-JI", latitude: 7.6736, longitude: 36.8344 },
      { name: "Nekemte", code: "OR-NE", latitude: 9.082, longitude: 36.5554 },
      {
        name: "Shashemene",
        code: "OR-SH",
        latitude: 7.2001,
        longitude: 38.5953,
      },
      { name: "Bishoftu", code: "OR-BI", latitude: 8.7523, longitude: 38.987 },
    ],
  },
  {
    name: "Sidama",
    code: "SI",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Hawassa", code: "SI-HA", latitude: 7.0504, longitude: 38.4952 },
      {
        name: "Aleta Wondo",
        code: "SI-AW",
        latitude: 6.9952,
        longitude: 38.3697,
      },
      { name: "Yirgalem", code: "SI-YI", latitude: 6.7595, longitude: 38.4123 },
      { name: "Dale", code: "SI-DA", latitude: 6.8712, longitude: 38.3224 },
    ],
  },
  {
    name: "Somali",
    code: "SO",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Jigjiga", code: "SO-JI", latitude: 9.3506, longitude: 42.7876 },
      { name: "Gode", code: "SO-GO", latitude: 5.9491, longitude: 43.5514 },
      {
        name: "Kebri Dehar",
        code: "SO-KD",
        latitude: 6.7421,
        longitude: 44.2782,
      },
      {
        name: "Degehabur",
        code: "SO-DE",
        latitude: 8.2167,
        longitude: 43.5667,
      },
    ],
  },
  {
    name: "South Ethiopia",
    code: "SE",
    primaryLanguage: Language.AMHARIC,
    districts: [
      {
        name: "Arba Minch",
        code: "SE-AM",
        latitude: 6.0311,
        longitude: 37.5517,
      },
      { name: "Dilla", code: "SE-DI", latitude: 6.4103, longitude: 38.3072 },
      { name: "Jinka", code: "SE-JK", latitude: 5.7931, longitude: 36.573 },
      { name: "Sawla", code: "SE-SA", latitude: 6.3058, longitude: 36.8815 },
    ],
  },
  {
    name: "South West Ethiopia Peoples'",
    code: "SW",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Bonga", code: "SW-BO", latitude: 7.2778, longitude: 36.2342 },
      {
        name: "Mizan Teferi",
        code: "SW-MT",
        latitude: 6.9987,
        longitude: 35.5888,
      },
      { name: "Tepi", code: "SW-TE", latitude: 7.2002, longitude: 35.45 },
      { name: "Sheko", code: "SW-SH", latitude: 7.1817, longitude: 35.4386 },
    ],
  },
  {
    name: "Tigray",
    code: "TI",
    primaryLanguage: Language.AMHARIC,
    districts: [
      { name: "Mekelle", code: "TI-ME", latitude: 13.4967, longitude: 39.4762 },
      { name: "Adigrat", code: "TI-AD", latitude: 14.277, longitude: 39.462 },
      { name: "Axum", code: "TI-AX", latitude: 14.1211, longitude: 38.7234 },
      { name: "Shire", code: "TI-SH", latitude: 14.1031, longitude: 38.2829 },
    ],
  },
];

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
            latitude: district.latitude,
            longitude: district.longitude,
          },
        });
        continue;
      }

      if (existingDistrictByRegionAndName) {
        await prisma.district.update({
          where: { id: existingDistrictByRegionAndName.id },
          data: {
            code: district.code,
            latitude: district.latitude,
            longitude: district.longitude,
          },
        });
        continue;
      }

      await prisma.district.create({
        data: {
          name: district.name,
          code: district.code,
          regionId: savedRegion.id,
          latitude: district.latitude,
          longitude: district.longitude,
        },
      });
    }
  }
}

async function seedUsers() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const hewPassword = "Hew@12345";

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const hewHash = await bcrypt.hash(hewPassword, 10);

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
      username: "hew_user",
      email: "hew@ethiosentinel.com",
      passwordHash: hewHash,
      role: Role.HEW,
      region: "Addis Ababa",
      assignedDistrict: "Bole",
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

async function main() {
  await seedRegionsAndDistricts();
  console.log("✅ Seeded Ethiopia regions and districts");

  await seedUsers();
  console.log("✅ Seeded Admin and HEW users");

  await seedReports();
  console.log("✅ Seeded sample disease reports");

  await seedAlerts();
  console.log("✅ Seeded sample alerts for approval");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
