import { Language, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const DEMO_NOTE_PREFIX = "Prediction demo seed";
const DEMO_DAYS = 40;
const REPORT_HOURS = [9, 18] as const;
const DEMO_DISEASES = [
  {
    name: "Malaria",
    slug: "malaria",
    code: "MAL",
    description: "Mosquito-borne disease causing fever, chills, and weakness.",
    symptomProfile: "Fever, chills, headache, sweating",
  },
  {
    name: "Cholera",
    slug: "cholera",
    code: "CHOL",
    description: "Acute diarrheal illness caused by contaminated food or water.",
    symptomProfile: "Watery diarrhea, vomiting, dehydration",
  },
  {
    name: "Dengue",
    slug: "dengue",
    code: "DENG",
    description: "Mosquito-borne viral illness with fever and body pain.",
    symptomProfile: "High fever, joint pain, rash, headache",
  },
  {
    name: "Measles",
    slug: "measles",
    code: "MEAS",
    description: "Highly contagious viral disease with fever and rash.",
    symptomProfile: "Fever, cough, rash, red eyes",
  },
  {
    name: "Ebola",
    slug: "ebola",
    code: "EBOL",
    description: "Severe viral hemorrhagic fever requiring urgent response.",
    symptomProfile: "Fever, weakness, vomiting, bleeding",
  },
  {
    name: "HIV/AIDS",
    slug: "hiv-aids",
    code: "HIV",
    description: "Chronic immune system infection requiring ongoing care.",
    symptomProfile: "Weight loss, fever, recurrent infections",
  },
];

function reportTimestamp(daysAgo: number, hour: number) {
  const ts = new Date();
  ts.setUTCDate(ts.getUTCDate() - daysAgo);
  ts.setUTCHours(hour, 0, 0, 0);
  return ts;
}

function demoCases(input: {
  daysAgo: number;
  hour: number;
  districtIndex: number;
  diseaseIndex: number;
}) {
  const { daysAgo, hour, districtIndex, diseaseIndex } = input;
  const trend = Math.max(0, DEMO_DAYS - daysAgo) * (0.08 + diseaseIndex * 0.04);
  const weeklyPattern = [1, 2, 0, 3, 1, 4, 2][daysAgo % 7];
  const timeOfDayAdjustment = hour === 18 ? 2 : 0;
  const base = 5 + diseaseIndex * 3 + (districtIndex % 5);
  const shouldSpike = (districtIndex + diseaseIndex) % 4 === 0;
  const latestSpike = shouldSpike
    ? daysAgo === 0
      ? 14 + diseaseIndex * 2
      : daysAgo === 1
        ? 7
        : 0
    : 0;

  return Math.max(
    0,
    Math.round(base + trend + weeklyPattern + timeOfDayAdjustment + latestSpike),
  );
}

async function ensureReferenceData() {
  const region = await prisma.region.upsert({
    where: { code: "AA" },
    update: {
      name: "Addis Ababa",
      primaryLanguage: Language.AMHARIC,
    },
    create: {
      name: "Addis Ababa",
      code: "AA",
      primaryLanguage: Language.AMHARIC,
    },
  });

  await prisma.district.upsert({
    where: { code: "AA-AR" },
    update: {
      regionId: region.id,
      name: "Arada",
      latitude: 9.0392,
      longitude: 38.7468,
    },
    create: {
      regionId: region.id,
      name: "Arada",
      code: "AA-AR",
      latitude: 9.0392,
      longitude: 38.7468,
    },
  });

  for (const disease of DEMO_DISEASES) {
    await prisma.disease.upsert({
      where: { slug: disease.slug },
      update: {
        name: disease.name,
        code: disease.code,
        description: disease.description,
        symptomProfile: disease.symptomProfile,
        isActive: true,
      },
      create: {
        ...disease,
        isActive: true,
      },
    });
  }

  const passwordHash = await bcrypt.hash("Hew@12345", 10);
  const reporter = await prisma.user.upsert({
    where: { email: "prediction.demo.hew@ethiosentinel.local" },
    update: {
      username: "Prediction Demo HEW",
      role: Role.HEW,
      isActive: true,
      region: "Addis Ababa",
      assignedDistrict: "Arada",
    },
    create: {
      username: "Prediction Demo HEW",
      email: "prediction.demo.hew@ethiosentinel.local",
      passwordHash,
      role: Role.HEW,
      isActive: true,
      region: "Addis Ababa",
      assignedDistrict: "Arada",
    },
  });

  const diseases = await prisma.disease.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const districts = await prisma.district.findMany({
    include: { region: true },
    orderBy: [{ regionId: "asc" }, { name: "asc" }],
  });

  return { diseases, districts, reporter };
}

async function main() {
  const { diseases, districts, reporter } = await ensureReferenceData();

  await prisma.anomalySignal.deleteMany({
    where: {
      notes: { startsWith: DEMO_NOTE_PREFIX },
    },
  });

  await prisma.diseaseReport.deleteMany({
    where: {
      notes: { startsWith: DEMO_NOTE_PREFIX },
    },
  });

  const reports = [];
  const anomalySignals = [];

  for (const [districtIndex, district] of districts.entries()) {
    for (const [diseaseIndex, disease] of diseases.entries()) {
      const comboValues: number[] = [];
      for (let daysAgo = DEMO_DAYS; daysAgo >= 0; daysAgo -= 1) {
        for (const hour of REPORT_HOURS) {
          const caseCount = demoCases({
            daysAgo,
            hour,
            districtIndex,
            diseaseIndex,
          });
          comboValues.push(caseCount);
          reports.push({
            district: district.name,
            diseaseType: disease.name,
            diseaseId: disease.id,
            reporterId: reporter.id,
            timestamp: reportTimestamp(daysAgo, hour),
            caseCount,
            deathCount: caseCount >= 35 && hour === 18 ? 1 : 0,
            status: "VERIFIED" as const,
            notes: `${DEMO_NOTE_PREFIX} - ${district.region.name} / ${district.name} / ${disease.name} (${daysAgo} days ago, ${hour}:00 UTC)`,
          });
        }
      }

      const baseline = comboValues.slice(0, -2);
      const latest = comboValues[comboValues.length - 1];
      const mean =
        baseline.reduce((sum, value) => sum + value, 0) / Math.max(1, baseline.length);
      const variance =
        baseline.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        Math.max(1, baseline.length);
      const stdDev = Math.max(1, Math.sqrt(variance));
      const zScore = (latest - mean) / stdDev;

      anomalySignals.push({
        district: district.name,
        diseaseType: disease.name,
        currentCases: latest,
        historicalMean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        zScore: Number(zScore.toFixed(4)),
        classification: zScore > 2 ? "ANOMALY" as const : "NORMAL" as const,
        method: "ZSCORE" as const,
        sampleSize: comboValues.length,
        lookbackStart: reportTimestamp(DEMO_DAYS, 0),
        lookbackEnd: new Date(),
        manual: false,
        notes: `${DEMO_NOTE_PREFIX} anomaly marker - ${district.region.name} / ${district.name} / ${disease.name}`,
      });
    }
  }

  const chunkSize = 1000;
  for (let i = 0; i < reports.length; i += chunkSize) {
    await prisma.diseaseReport.createMany({ data: reports.slice(i, i + chunkSize) });
  }
  for (let i = 0; i < anomalySignals.length; i += chunkSize) {
    await prisma.anomalySignal.createMany({
      data: anomalySignals.slice(i, i + chunkSize),
    });
  }

  console.log(
    `✅ Seeded ${reports.length} prediction demo reports and ${anomalySignals.length} anomaly markers across ${districts.length} districts and ${diseases.length} diseases.`,
  );
}

main()
  .catch((error) => {
    console.error("❌ Prediction demo seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
