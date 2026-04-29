import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";

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
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(userId: string, chatId: string) {
    await this.assertChatMember(userId, chatId);

    return this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50,
      select: this.messageSelect(),
    });
  }

  async createMessage(userId: string, dto: SendMessageDto) {
    await this.assertChatMember(userId, dto.chatId);

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

      return tx.message.findUniqueOrThrow({
        where: { id: message.id },
        select: this.messageSelect(),
      });
    });
  }

  async createMediaMessage(userId: string, input: MediaMessageInput) {
    await this.assertChatMember(userId, input.chatId);

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

      return tx.message.findUniqueOrThrow({
        where: { id: message.id },
        select: this.messageSelect(),
      });
    });
  }

  async markDelivered(userId: string, chatId: string) {
    return this.markReceipts(userId, chatId, "delivered");
  }

  async markRead(userId: string, chatId: string) {
    return this.markReceipts(userId, chatId, "read");
  }

  async getChatMemberIds(chatId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });

    return members.map((member) => member.userId);
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
}
