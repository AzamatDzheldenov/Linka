ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "allowSearchByUsername" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "UserSettings"
SET "allowSearchByUsername" = false
WHERE "usernameDiscovery" = 'nobody';

ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "usernameDiscovery";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "pushNotificationsEnabled";
