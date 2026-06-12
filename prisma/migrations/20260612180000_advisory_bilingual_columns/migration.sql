-- Add Amharic fields so each advisory stores both languages at creation time.
ALTER TABLE "Advisory" ADD COLUMN IF NOT EXISTS "titleAmharic" TEXT;
ALTER TABLE "Advisory" ADD COLUMN IF NOT EXISTS "contentAmharic" TEXT;
