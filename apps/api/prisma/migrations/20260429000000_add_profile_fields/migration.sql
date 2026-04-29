ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;

UPDATE "User"
SET "firstName" = COALESCE(NULLIF(TRIM("displayName"), ''), "username");

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
