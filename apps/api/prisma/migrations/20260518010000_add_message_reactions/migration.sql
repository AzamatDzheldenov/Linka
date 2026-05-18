CREATE TABLE "MessageReaction" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageReaction_userId_messageId_emoji_key" ON "MessageReaction"("userId", "messageId", "emoji");

CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
