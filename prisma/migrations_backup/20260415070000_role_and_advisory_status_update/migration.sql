-- Rename enum UserRole to Role while preserving existing user values.
ALTER TYPE "UserRole" RENAME TO "Role";

-- Drop AdvisoryStatus.ARCHIVED by recreating the enum with accepted values.
BEGIN;
CREATE TYPE "AdvisoryStatus_new" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."Advisory" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Advisory"
ALTER COLUMN "status" TYPE "AdvisoryStatus_new"
USING ("status"::text::"AdvisoryStatus_new");
ALTER TYPE "AdvisoryStatus" RENAME TO "AdvisoryStatus_old";
ALTER TYPE "AdvisoryStatus_new" RENAME TO "AdvisoryStatus";
DROP TYPE "public"."AdvisoryStatus_old";
ALTER TABLE "Advisory" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;
