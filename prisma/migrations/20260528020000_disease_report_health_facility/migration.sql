-- AlterTable
ALTER TABLE "DiseaseReport" ADD COLUMN IF NOT EXISTS "healthFacilityId" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DiseaseReport_healthFacilityId_idx" ON "DiseaseReport"("healthFacilityId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiseaseReport_healthFacilityId_fkey'
  ) THEN
    ALTER TABLE "DiseaseReport"
      ADD CONSTRAINT "DiseaseReport_healthFacilityId_fkey"
      FOREIGN KEY ("healthFacilityId") REFERENCES "HealthFacility"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
