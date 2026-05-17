import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { access } from "fs/promises";
import { extname, join } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";

export const MESSAGE_UPLOAD_DIR = join(
  __dirname,
  "..",
  "..",
  "uploads",
  "messages",
);

const MESSAGE_FILE_ID_PATTERN =
  /^[a-f0-9-]+\.(jpg|png|webp|mp4|mp3|webm|pdf)$/i;
const MEDIA_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".webm": "audio/webm",
  ".pdf": "application/pdf",
};

type MediaMessageInput = {
  chatId: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "audio" | "document";
  text?: string;
};

export type MessageReceiptUpdate = {
  chatId: string;
  userId: string;
  senderId: string;
  messageIds: string[];
  deliveredAt?: Date;
  readAt?: Date;
};

@Injectable()
export class MessagesService {
  private readonly messagePageSize = 50;

  constructor(private readonly prisma: PrismaService) {}

  async getMessages(userId: string, chatId: string, cursor?: string) {
    await this.assertChatMember(userId, chatId);

    const cursorMessage = cursor
      ? await this.prisma.message.findFirst({
          where: {
            id: cursor,
            chatId,
            deletedAt: null,
          },
          select: {
            id: true,
            createdAt: true,
          },
        })
      : null;

    if (cursor && !cursorMessage) {
      throw new BadRequestException("Message cursor is invalid");
    }

    const fetchedMessages = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        ...(cursorMessage
          ? {
              OR: [
                { createdAt: { lt: cursorMessage.createdAt } },
                {
                  createdAt: cursorMessage.createdAt,
                  id: { lt: cursorMessage.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: this.messagePageSize + 1,
      select: this.messageSelect(),
    });

    const hasMore = fetchedMessages.length > this.messagePageSize;
    const messages = fetchedMessages
      .slice(0, this.messagePageSize)
      .reverse()
      .map((message) => this.toSafeMessageMediaUrl(message));

    return {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]?.id ?? null : null,
    };
  }

  async createMessage(userId: string, dto: SendMessageDto) {
    await this.assertCanSendMessage(userId, dto.chatId);

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          chatId: dto.chatId,
          senderId: userId,
          text: dto.text.trim(),
        },
        select: this.messageSelect(),
      });

      const recipientIds = await this.getReceiptRecipientIds(dto.chatId, userId);
      await tx.messageReceipt.createMany({
        data: recipientIds.map((recipientId) => ({
          messageId: message.id,
          userId: recipientId,
        })),
        skipDuplicates: true,
      });

      await tx.chat.update({
        where: { id: dto.chatId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });

      const createdMessage = await tx.message.findUniqueOrThrow({
        where: { id: message.id },
        select: this.messageSelect(),
      });

      return this.toSafeMessageMediaUrl(createdMessage);
    });
  }

  async createMediaMessage(userId: string, input: MediaMessageInput) {
    await this.assertCanSendMessage(userId, input.chatId);

    return this.prisma.$transaction(async (tx) => {
      const text = input.text?.trim() || null;
      const message = await tx.message.create({
        data: {
          chatId: input.chatId,
          senderId: userId,
          text,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType,
        },
        select: this.messageSelect(),
      });

      const recipientIds = await this.getReceiptRecipientIds(input.chatId, userId);
      await tx.messageReceipt.createMany({
        data: recipientIds.map((recipientId) => ({
          messageId: message.id,
          userId: recipientId,
        })),
        skipDuplicates: true,
      });

      await tx.chat.update({
        where: { id: input.chatId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });

      const createdMessage = await tx.message.findUniqueOrThrow({
        where: { id: message.id },
        select: this.messageSelect(),
      });

      return this.toSafeMessageMediaUrl(createdMessage);
    });
  }

  async markDelivered(userId: string, chatId: string) {
    return this.markReceipts(userId, chatId, "delivered");
  }

  async markRead(userId: string, chatId: string) {
    return this.markReceipts(userId, chatId, "read");
  }

  async deleteMessage(userId: string, chatId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        chatId,
        deletedAt: null,
      },
      select: {
        id: true,
        senderId: true,
      },
    });

    if (!message) {
      throw new ForbiddenException("Message not found");
    }

    if (message.senderId !== userId) {
      await this.assertCanModerateMessages(userId, chatId);
    } else {
      await this.assertChatMember(userId, chatId);
    }

    const deletedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        text: null,
        mediaUrl: null,
        mediaType: null,
      },
      select: this.messageSelect(),
    });

    return this.toSafeMessageMediaUrl(deletedMessage);
  }

  async getChatMemberIds(chatId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });

    return members.map((member) => member.userId);
  }

  async getMediaFile(userId: string, fileId: string) {
    if (!MESSAGE_FILE_ID_PATTERN.test(fileId)) {
      throw new BadRequestException("Invalid media file id");
    }

    const message = await this.prisma.message.findFirst({
      where: {
        mediaUrl: {
          in: [`/uploads/messages/${fileId}`, `/messages/media/${fileId}`],
        },
        deletedAt: null,
        chat: {
          members: {
            some: { userId },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!message) {
      throw new NotFoundException("Media file not found");
    }

    const filePath = join(MESSAGE_UPLOAD_DIR, fileId);

    try {
      await access(filePath);
    } catch {
      throw new NotFoundException("Media file not found");
    }

    return {
      filePath,
      contentType: MEDIA_CONTENT_TYPES[extname(fileId).toLowerCase()],
    };
  }

  async assertChatMember(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this chat");
    }
  }

  async assertCanSendMessage(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    if (
      membership.chat.type === "channel" &&
      !["owner", "admin"].includes(membership.role)
    ) {
      throw new ForbiddenException("Only channel admins can post");
    }
  }

  private async assertCanModerateMessages(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: {
          select: {
            type: true,
          },
        },
      },
    });

    if (
      !membership ||
      membership.chat.type !== "group" ||
      !["owner", "admin"].includes(membership.role)
    ) {
      throw new ForbiddenException("Only group admins can delete messages");
    }
  }

  async getTypingUser(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            nameEmoji: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    return membership.user;
  }

  private async markReceipts(
    userId: string,
    chatId: string,
    status: "delivered" | "read",
  ): Promise<MessageReceiptUpdate[]> {
    await this.assertChatMember(userId, chatId);

    const shouldEmitReadReceipts =
      status !== "read" || (await this.shouldEmitReadReceipts(userId));

    const pendingReceipts = await this.prisma.messageReceipt.findMany({
      where: {
        userId,
        message: {
          chatId,
          senderId: { not: userId },
          deletedAt: null,
        },
        ...(status === "delivered"
          ? { deliveredAt: null }
          : { readAt: null }),
      },
      select: {
        id: true,
        messageId: true,
        message: {
          select: {
            senderId: true,
          },
        },
      },
    });

    if (!pendingReceipts.length) {
      return [];
    }

    const timestamp = new Date();
    await this.prisma.messageReceipt.updateMany({
      where: {
        id: { in: pendingReceipts.map((receipt) => receipt.id) },
      },
      data:
        status === "delivered"
          ? { deliveredAt: timestamp }
          : { deliveredAt: timestamp, readAt: timestamp },
    });

    const updates = new Map<string, MessageReceiptUpdate>();
    pendingReceipts.forEach((receipt) => {
      const senderId = receipt.message.senderId;
      const currentUpdate =
        updates.get(senderId) ??
        {
          chatId,
          userId,
          senderId,
          messageIds: [],
          ...(status === "delivered"
            ? { deliveredAt: timestamp }
            : { readAt: timestamp }),
        };

      currentUpdate.messageIds.push(receipt.messageId);
      updates.set(senderId, currentUpdate);
    });

    return shouldEmitReadReceipts ? [...updates.values()] : [];
  }

  private async shouldEmitReadReceipts(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { showReadReceipts: true },
    });

    return settings?.showReadReceipts !== false;
  }

  private async getReceiptRecipientIds(chatId: string, senderId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: {
        chatId,
        userId: { not: senderId },
      },
      select: { userId: true },
    });

    return members.map((member) => member.userId);
  }

  private messageSelect() {
    return {
      id: true,
      chatId: true,
      senderId: true,
      text: true,
      mediaUrl: true,
      mediaType: true,
      createdAt: true,
      updatedAt: true,
      editedAt: true,
      deletedAt: true,
      sender: {
        select: {
          id: true,
          username: true,
          displayName: true,
          nameEmoji: true,
          avatarUrl: true,
        },
      },
      receipts: {
        select: {
          userId: true,
          deliveredAt: true,
          readAt: true,
        },
      },
    } as const;
  }

  private toSafeMessageMediaUrl<T extends { mediaUrl: string | null }>(
    message: T,
  ): T {
    if (!message.mediaUrl?.startsWith("/uploads/messages/")) {
      return message;
    }

    const fileId = message.mediaUrl.split("/").filter(Boolean).at(-1);

    if (!fileId) {
      return message;
    }

    return {
      ...message,
      mediaUrl: `/messages/media/${fileId}`,
    };
  }
}
