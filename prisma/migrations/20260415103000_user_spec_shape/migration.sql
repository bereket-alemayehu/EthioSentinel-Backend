-- Add user shape fields from product spec while keeping existing PK strategy.
ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "assignedDistrict" TEXT,
ADD COLUMN "clearanceLevel" TEXT;

-- Backfill username from email local-part.
UPDATE "User"
SET "username" = lower(split_part(email, '@', 1))
WHERE "username" IS NULL;

-- Resolve possible duplicate usernames after local-part extraction.
WITH dup AS (
  SELECT id, username, row_number() OVER (PARTITION BY username ORDER BY id) AS rn
  FROM "User"
)
UPDATE "User" u
SET "username" = u.username || '_' || u.id
FROM dup
WHERE u.id = dup.id
  AND dup.rn > 1;

-- Backfill region display string from relation when possible.
UPDATE "User" u
SET "region" = COALESCE(r.name, 'UNASSIGNED')
FROM "Region" r
WHERE u."regionId" = r.id
  AND u."region" IS NULL;

UPDATE "User"
SET "region" = 'UNASSIGNED'
WHERE "region" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "region" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
