-- CreateEnum
CREATE TYPE "AnomalyClassification" AS ENUM ('NORMAL', 'ANOMALY');
CREATE TYPE "AnomalyMethod" AS ENUM ('ZSCORE', 'ARIMA');

-- CreateTable
CREATE TABLE "AnomalySignal" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "district" TEXT NOT NULL,
    "diseaseType" TEXT NOT NULL,
    "currentCases" DOUBLE PRECISION NOT NULL,
    "historicalMean" DOUBLE PRECISION NOT NULL,
    "stdDev" DOUBLE PRECISION NOT NULL,
    "zScore" DOUBLE PRECISION,
    "classification" "AnomalyClassification" NOT NULL DEFAULT 'NORMAL',
    "method" "AnomalyMethod" NOT NULL DEFAULT 'ZSCORE',
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "lookbackStart" TIMESTAMP(3),
    "lookbackEnd" TIMESTAMP(3),
    "advisoryId" TEXT,
    "alertId" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnomalySignal_district_diseaseType_createdAt_idx" ON "AnomalySignal"("district", "diseaseType", "createdAt");
CREATE INDEX "AnomalySignal_classification_idx" ON "AnomalySignal"("classification");
CREATE INDEX "AnomalySignal_reportId_idx" ON "AnomalySignal"("reportId");

-- AddForeignKey
ALTER TABLE "AnomalySignal" ADD CONSTRAINT "AnomalySignal_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DiseaseReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
