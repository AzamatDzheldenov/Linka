ALTER TABLE "Message" ADD COLUMN "replyToMessageId" UUID;
ALTER TABLE "Message" ADD COLUMN "forwardedFromMessageId" UUID;
ALTER TABLE "Message" ADD COLUMN "forwardedFromUserId" UUID;
ALTER TABLE "Message" ADD COLUMN "forwardedFromChatId" UUID;

CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
CREATE INDEX "Message_forwardedFromMessageId_idx" ON "Message"("forwardedFromMessageId");
CREATE INDEX "Message_forwardedFromUserId_idx" ON "Message"("forwardedFromUserId");
CREATE INDEX "Message_forwardedFromChatId_idx" ON "Message"("forwardedFromChatId");

ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromMessageId_fkey" FOREIGN KEY ("forwardedFromMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromUserId_fkey" FOREIGN KEY ("forwardedFromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_forwardedFromChatId_fkey" FOREIGN KEY ("forwardedFromChatId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
