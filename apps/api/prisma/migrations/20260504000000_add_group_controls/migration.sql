ALTER TABLE "UserSettings"
ADD COLUMN "requireGroupInviteApproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Chat"
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "wallpaperUrl" TEXT;

CREATE TABLE "GroupInvite" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "inviterId" UUID NOT NULL,
    "inviteeId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupInvite_chatId_inviteeId_key" ON "GroupInvite"("chatId", "inviteeId");
CREATE INDEX "GroupInvite_inviteeId_status_idx" ON "GroupInvite"("inviteeId", "status");
CREATE INDEX "GroupInvite_chatId_idx" ON "GroupInvite"("chatId");

ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupInvite" ADD CONSTRAINT "GroupInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
