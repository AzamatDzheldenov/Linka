ALTER TABLE "User" ADD COLUMN "nameEmoji" TEXT;

CREATE UNIQUE INDEX "User_nameEmoji_key" ON "User"("nameEmoji");
