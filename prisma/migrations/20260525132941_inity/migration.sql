-- CreateTable
CREATE TABLE "HealthFacility" (
    "id" SERIAL NOT NULL,
    "regionId" INTEGER,
    "districtId" INTEGER,
    "ownerId" TEXT,
    "Region" TEXT NOT NULL,
    "Zone" TEXT NOT NULL,
    "Woreda" TEXT NOT NULL,
    "HF_Name" TEXT NOT NULL,
    "HF_Type" TEXT NOT NULL,
    "Y" DECIMAL(9,6),
    "X" DECIMAL(9,6),
    "X1" DOUBLE PRECISION,
    "N" DOUBLE PRECISION,
    "E" DOUBLE PRECISION,
    "Z" DOUBLE PRECISION,
    "owner" TEXT,
    "Status" TEXT,

    CONSTRAINT "HealthFacility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthFacility_regionId_idx" ON "HealthFacility"("regionId");

-- CreateIndex
CREATE INDEX "HealthFacility_districtId_idx" ON "HealthFacility"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthFacility_districtId_HF_Name_key" ON "HealthFacility"("districtId", "HF_Name");

-- AddForeignKey
ALTER TABLE "HealthFacility" ADD CONSTRAINT "HealthFacility_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFacility" ADD CONSTRAINT "HealthFacility_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthFacility" ADD CONSTRAINT "HealthFacility_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
