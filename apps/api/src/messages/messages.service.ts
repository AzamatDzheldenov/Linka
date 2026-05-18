import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { access } from "fs/promises";
import { extname, join } from "path";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";
import {
  SUPPORTED_MESSAGE_REACTIONS,
  SupportedMessageReaction,
} from "./message-reactions.constants";

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
  replyToMessageId?: string;
};

export type MessageReceiptUpdate = {
  chatId: string;
  userId: string;
  senderId: string;
  messageIds: string[];
  deliveredAt?: Date;
  readAt?: Date;
};

type ReactionUserPreview = {
  id: string;
  username: string;
  displayName: string | null;
  nameEmoji: string | null;
  avatarUrl: string | null;
};

export type MessageReactionGroup = {
  emoji: SupportedMessageReaction;
  count: number;
  reactedByMe: boolean;
  usersPreview: ReactionUserPreview[];
};

@Injectable()
export class MessagesService {
  private readonly messagePageSize = 50;
  private readonly reactionWindowMs = 10_000;
  private readonly maxReactionsPerWindow = 20;
  private readonly reactionAttempts = new Map<string, number[]>();

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
      .map((message) => this.toMessageResponse(message, userId));

    return {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]?.id ?? null : null,
    };
  }

  async createMessage(userId: string, dto: SendMessageDto) {
    await this.assertCanSendMessage(userId, dto.chatId);
    await this.assertValidReplyTarget(dto.chatId, dto.replyToMessageId);

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          chatId: dto.chatId,
          senderId: userId,
          text: dto.text.trim(),
          replyToMessageId: dto.replyToMessageId,
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

      return this.toMessageResponse(createdMessage, userId);
    });
  }

  async createMediaMessage(userId: string, input: MediaMessageInput) {
    await this.assertCanSendMessage(userId, input.chatId);
    await this.assertValidReplyTarget(input.chatId, input.replyToMessageId);

    return this.prisma.$transaction(async (tx) => {
      const text = input.text?.trim() || null;
      const message = await tx.message.create({
        data: {
          chatId: input.chatId,
          senderId: userId,
          text,
          mediaUrl: input.mediaUrl,
          mediaType: input.mediaType,
          replyToMessageId: input.replyToMessageId,
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

      return this.toMessageResponse(createdMessage, userId);
    });
  }

  async forwardMessage(
    userId: string,
    messageId: string,
    targetChatIds: string[],
  ) {
    const sourceMessage = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        chat: {
          members: {
            some: { userId },
          },
        },
      },
      select: {
        id: true,
        chatId: true,
        senderId: true,
        text: true,
        mediaUrl: true,
        mediaType: true,
        deletedAt: true,
      },
    });

    if (!sourceMessage) {
      throw new ForbiddenException("Message not found");
    }

    if (sourceMessage.deletedAt) {
      throw new BadRequestException("cannot forward deleted message");
    }

    const uniqueTargetChatIds = [...new Set(targetChatIds)];

    for (const targetChatId of uniqueTargetChatIds) {
      try {
        await this.assertCanSendMessage(userId, targetChatId);
      } catch {
        throw new ForbiddenException("no permission to post in target chat");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const createdMessages = [];

      for (const targetChatId of uniqueTargetChatIds) {
        const message = await tx.message.create({
          data: {
            chatId: targetChatId,
            senderId: userId,
            text: sourceMessage.text,
            mediaUrl: sourceMessage.mediaUrl,
            mediaType: sourceMessage.mediaType,
            forwardedFromMessageId: sourceMessage.id,
            forwardedFromUserId: sourceMessage.senderId,
            forwardedFromChatId: sourceMessage.chatId,
          },
          select: this.messageSelect(),
        });

        const recipientIds = await this.getReceiptRecipientIds(targetChatId, userId);
        await tx.messageReceipt.createMany({
          data: recipientIds.map((recipientId) => ({
            messageId: message.id,
            userId: recipientId,
          })),
          skipDuplicates: true,
        });

        await tx.chat.update({
          where: { id: targetChatId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });

        const createdMessage = await tx.message.findUniqueOrThrow({
          where: { id: message.id },
          select: this.messageSelect(),
        });
        createdMessages.push(this.toMessageResponse(createdMessage, userId));
      }

      return createdMessages;
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

    return this.toMessageResponse(deletedMessage, userId);
  }

  async toggleMessageReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ) {
    this.assertReactionRateLimit(userId);
    const supportedEmoji = this.assertSupportedReaction(emoji);
    const message = await this.assertCanReactToMessage(userId, messageId);

    await this.prisma.$transaction(async (tx) => {
      const existingReaction = await tx.messageReaction.findUnique({
        where: {
          userId_messageId_emoji: {
            userId,
            messageId,
            emoji: supportedEmoji,
          },
        },
        select: { id: true },
      });

      if (existingReaction) {
        await tx.messageReaction.delete({
          where: { id: existingReaction.id },
        });
        return;
      }

      await tx.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji: supportedEmoji,
        },
        select: { id: true },
      });
    });

    return {
      messageId,
      chatId: message.chatId,
      reactions: await this.getMessageReactions(userId, messageId),
    };
  }

  async deleteMessageReaction(userId: string, messageId: string, emoji: string) {
    this.assertReactionRateLimit(userId);
    const supportedEmoji = this.assertSupportedReaction(emoji);
    const message = await this.assertCanReactToMessage(userId, messageId);

    await this.prisma.messageReaction.deleteMany({
      where: {
        messageId,
        userId,
        emoji: supportedEmoji,
      },
    });

    return {
      messageId,
      chatId: message.chatId,
      reactions: await this.getMessageReactions(userId, messageId),
    };
  }

  async getMessageReactions(userId: string, messageId: string) {
    await this.assertCanReactToMessage(userId, messageId);
    const reactions = await this.prisma.messageReaction.findMany({
      where: { messageId },
      orderBy: { createdAt: "asc" },
      select: this.reactionSelect(),
    });

    return this.toReactionGroups(reactions, userId);
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

  private async assertValidReplyTarget(
    chatId: string,
    replyToMessageId?: string,
  ) {
    if (!replyToMessageId) {
      return;
    }

    const replyToMessage = await this.prisma.message.findUnique({
      where: { id: replyToMessageId },
      select: {
        id: true,
        chatId: true,
        deletedAt: true,
      },
    });

    if (!replyToMessage) {
      throw new BadRequestException("Reply message not found");
    }

    if (replyToMessage.chatId !== chatId) {
      throw new BadRequestException("cannot reply to message from another chat");
    }

    if (replyToMessage.deletedAt) {
      throw new BadRequestException("cannot reply to deleted message");
    }
  }

  private async assertCanReactToMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        chatId: true,
        deletedAt: true,
        chat: {
          select: {
            members: {
              where: { userId },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException("message not found");
    }

    if (!message.chat.members.length) {
      throw new ForbiddenException("no access to message");
    }

    if (message.deletedAt) {
      throw new BadRequestException("cannot react to deleted message");
    }

    return message;
  }

  private assertSupportedReaction(emoji: string): SupportedMessageReaction {
    if (
      !SUPPORTED_MESSAGE_REACTIONS.includes(
        emoji as SupportedMessageReaction,
      )
    ) {
      throw new BadRequestException("unsupported reaction");
    }

    return emoji as SupportedMessageReaction;
  }

  private assertReactionRateLimit(userId: string) {
    const now = Date.now();
    const recentAttempts = (this.reactionAttempts.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < this.reactionWindowMs,
    );

    if (recentAttempts.length >= this.maxReactionsPerWindow) {
      this.reactionAttempts.set(userId, recentAttempts);
      throw new HttpException("Too many reactions", HttpStatus.TOO_MANY_REQUESTS);
    }

    recentAttempts.push(now);
    this.reactionAttempts.set(userId, recentAttempts);
  }

  private userPreviewSelect() {
    return {
      id: true,
      username: true,
      displayName: true,
      nameEmoji: true,
      avatarUrl: true,
    } as const;
  }

  private reactionSelect() {
    return {
      emoji: true,
      userId: true,
      user: {
        select: this.userPreviewSelect(),
      },
    } as const;
  }

  private messageSelect() {
    return {
      id: true,
      chatId: true,
      senderId: true,
      text: true,
      mediaUrl: true,
      mediaType: true,
      replyToMessageId: true,
      forwardedFromMessageId: true,
      forwardedFromUserId: true,
      forwardedFromChatId: true,
      createdAt: true,
      updatedAt: true,
      editedAt: true,
      deletedAt: true,
      sender: {
        select: this.userPreviewSelect(),
      },
      replyToMessage: {
        select: {
          id: true,
          senderId: true,
          text: true,
          mediaUrl: true,
          mediaType: true,
          deletedAt: true,
          sender: {
            select: this.userPreviewSelect(),
          },
        },
      },
      forwardedFromUser: {
        select: this.userPreviewSelect(),
      },
      forwardedFromChat: {
        select: {
          id: true,
          type: true,
          title: true,
        },
      },
      receipts: {
        select: {
          userId: true,
          deliveredAt: true,
          readAt: true,
        },
      },
      reactions: {
        orderBy: { createdAt: "asc" },
        select: this.reactionSelect(),
      },
    } as const;
  }

  private toMessageResponse(message: any, currentUserId: string) {
    const normalizedMessage = {
      ...message,
      mediaUrl: this.toSafeMediaUrl(message.mediaUrl),
      reactions: this.toReactionGroups(message.reactions ?? [], currentUserId),
      replyTo: message.replyToMessage
        ? {
            id: message.replyToMessage.id,
            senderId: message.replyToMessage.senderId,
            sender: message.replyToMessage.sender,
            text: message.replyToMessage.deletedAt
              ? null
              : message.replyToMessage.text,
            mediaUrl: message.replyToMessage.deletedAt
              ? null
              : this.toSafeMediaUrl(message.replyToMessage.mediaUrl),
            mediaType: message.replyToMessage.deletedAt
              ? null
              : message.replyToMessage.mediaType,
            deletedAt: message.replyToMessage.deletedAt,
          }
        : null,
      forwardedFrom: message.forwardedFromUser
        ? {
            messageId: message.forwardedFromMessageId,
            userId: message.forwardedFromUserId,
            chatId: message.forwardedFromChatId,
            sender: message.forwardedFromUser,
            label: "Forwarded message",
            chatTitle:
              message.forwardedFromChat?.type === "channel" ||
              message.forwardedFromChat?.type === "group"
                ? message.forwardedFromChat.title
                : null,
          }
        : null,
    };

    delete normalizedMessage.replyToMessage;
    delete normalizedMessage.forwardedFromUser;
    delete normalizedMessage.forwardedFromChat;

    return normalizedMessage;
  }

  private toSafeMediaUrl(mediaUrl: string | null) {
    if (!mediaUrl?.startsWith("/uploads/messages/")) {
      return mediaUrl;
    }

    const fileId = mediaUrl.split("/").filter(Boolean).at(-1);

    return fileId ? `/messages/media/${fileId}` : mediaUrl;
  }

  private toReactionGroups(
    reactions: Array<{
      emoji: string;
      userId: string;
      user: ReactionUserPreview;
    }>,
    currentUserId: string,
  ): MessageReactionGroup[] {
    const groups = new Map<SupportedMessageReaction, MessageReactionGroup>();

    reactions.forEach((reaction) => {
      if (
        !SUPPORTED_MESSAGE_REACTIONS.includes(
          reaction.emoji as SupportedMessageReaction,
        )
      ) {
        return;
      }

      const emoji = reaction.emoji as SupportedMessageReaction;
      const group =
        groups.get(emoji) ??
        {
          emoji,
          count: 0,
          reactedByMe: false,
          usersPreview: [],
        };

      group.count += 1;
      group.reactedByMe = group.reactedByMe || reaction.userId === currentUserId;

      if (group.usersPreview.length < 3) {
        group.usersPreview.push(reaction.user);
      }

      groups.set(emoji, group);
    });

    return SUPPORTED_MESSAGE_REACTIONS.map((emoji) => groups.get(emoji)).filter(
      (group): group is MessageReactionGroup => Boolean(group),
    );
  }
}
