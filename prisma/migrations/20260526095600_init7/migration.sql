/*
  Warnings:

  - A unique constraint covering the columns `[healthFacilityId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "healthFacilityId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_healthFacilityId_key" ON "User"("healthFacilityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_healthFacilityId_fkey" FOREIGN KEY ("healthFacilityId") REFERENCES "HealthFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;
