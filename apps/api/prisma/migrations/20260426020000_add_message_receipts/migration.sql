CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "MessageReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageReceipt_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MessageReceipt" ("messageId", "userId", "createdAt", "updatedAt")
SELECT "Message"."id", "ChatMember"."userId", NOW(), NOW()
FROM "Message"
JOIN "ChatMember" ON "ChatMember"."chatId" = "Message"."chatId"
WHERE "ChatMember"."userId" <> "Message"."senderId"
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "MessageReceipt_messageId_userId_key" ON "MessageReceipt"("messageId", "userId");
CREATE INDEX "MessageReceipt_userId_idx" ON "MessageReceipt"("userId");
CREATE INDEX "MessageReceipt_messageId_idx" ON "MessageReceipt"("messageId");

ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReceipt" ADD CONSTRAINT "MessageReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
