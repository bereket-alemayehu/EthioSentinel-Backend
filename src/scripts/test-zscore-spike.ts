import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AIService } from "../services/ai.service";
import { Language, Role } from "@prisma/client";

function daysAgoUtc(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function ensureRegionAndDistrict() {
  const region = await prisma.region.upsert({
    where: { code: "AA" },
    update: { name: "Addis Ababa", primaryLanguage: Language.AMHARIC },
    create: {
      name: "Addis Ababa",
      code: "AA",
      primaryLanguage: Language.AMHARIC,
    },
    select: { id: true },
  });

  await prisma.district.upsert({
    where: { code: "AA-BO" },
    update: {
      name: "Bole",
      regionId: region.id,
      latitude: 8.9985,
      longitude: 38.7873,
    },
    create: {
      name: "Bole",
      code: "AA-BO",
      regionId: region.id,
      latitude: 8.9985,
      longitude: 38.7873,
    },
    select: { id: true },
  });
}

async function ensureUsers() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const hewHash = await bcrypt.hash("Hew@12345", 10);

  await prisma.user.upsert({
    where: { email: "admin@ethiosentinel.com" },
    update: { passwordHash: adminHash, role: Role.ADMIN, isActive: true },
    create: {
      username: "admin",
      email: "admin@ethiosentinel.com",
      passwordHash: adminHash,
      role: Role.ADMIN,
      isActive: true,
      region: "Addis Ababa",
    },
  });

  const hew = await prisma.user.upsert({
    where: { email: "hew@ethiosentinel.com" },
    update: { passwordHash: hewHash, role: Role.HEW, isActive: true },
    create: {
      username: "HEW Professional",
      email: "hew@ethiosentinel.com",
      passwordHash: hewHash,
      role: Role.HEW,
      isActive: true,
      region: "Addis Ababa",
      assignedDistrict: "Bole",
    },
    select: { id: true },
  });

  return hew.id;
}

async function seedBaselineReports(reporterId: string) {
  const district = "Bole";
  const diseaseType = "Malaria";

  // Keep the test idempotent: delete existing baseline reports in the lookback window
  await prisma.diseaseReport.deleteMany({
    where: {
      district,
      diseaseType,
      timestamp: { gte: daysAgoUtc(10) },
    },
  });

  // 7 baseline daily points
  const baselineCases = [9, 10, 11, 10, 12, 9, 11];
  for (let i = 0; i < baselineCases.length; i += 1) {
    const daysBack = 7 - i;
    await prisma.diseaseReport.create({
      data: {
        district,
        diseaseType,
        reporterId,
        timestamp: daysAgoUtc(daysBack),
        caseCount: baselineCases[i],
        deathCount: 0,
        status: "VERIFIED",
        notes: "Baseline test data for z-score",
      },
    });
  }

  const spikeReport = await prisma.diseaseReport.create({
    data: {
      district,
      diseaseType,
      reporterId,
      timestamp: new Date(),
      caseCount: 30,
      deathCount: 0,
      status: "VERIFIED",
      notes: "Spike test data for z-score",
    },
    select: { id: true },
  });

  return { spikeReportId: spikeReport.id, district, diseaseType };
}

async function main() {
  console.log("\n== Z-Score Spike Test ==");
  console.log("Ensuring region/district + users...");
  await ensureRegionAndDistrict();
  const reporterId = await ensureUsers();

  console.log("Creating baseline + spike reports...");
  const { spikeReportId, district, diseaseType } =
    await seedBaselineReports(reporterId);

  console.log("Triggering AI z-score analysis for spike report...", {
    spikeReportId,
    diseaseType,
    district,
  });
  await AIService.triggerZScoreAnomaly(spikeReportId);

  const advisoryDraft = await prisma.advisory.findFirst({
    where: { sourceReportId: spikeReportId, generatedByAI: true },
    select: { id: true, status: true, riskLevel: true, title: true },
  });

  const alert = await prisma.alert.findFirst({
    where: { sourceReportId: spikeReportId, aiSuggested: true },
    select: {
      id: true,
      title: true,
      severity: true,
      isDelivered: true,
      deliveryCount: true,
      failedCount: true,
      advisoryId: true,
      createdAt: true,
    },
  });

  console.log("\nResult:");
  console.log({
    spikeReportId,
    advisoryDraft,
    alert,
  });

  if (!alert) {
    console.log(
      "\nNo AI alert was created. If the Python service is running, double-check `AI_SERVICE_BASE_URL` and `AI_SERVICE_ZSCORE_PATH` in your backend .env.",
    );
  }
}

main()
  .catch((error) => {
    console.error("\nTest script failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
