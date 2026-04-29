import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ChatWithMembers = {
  id: string;
  type: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      nameEmoji: string | null;
      avatarUrl: string | null;
    };
  }>;
  messages: Array<{
    id: string;
    text: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: Date;
    senderId: string;
    sender: {
      id: string;
      username: string;
      displayName: string | null;
      nameEmoji: string | null;
      avatarUrl: string | null;
    };
  }>;
};

@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPrivateChat(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException("Cannot create a private chat with yourself");
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException("User not found");
    }

    const existingChat = await this.findPrivateChat(currentUserId, targetUserId);
    if (existingChat) {
      return this.toChatResponse(existingChat, currentUserId);
    }

    const chat = await this.prisma.chat.create({
      data: {
        type: "private",
        members: {
          create: [
            { userId: currentUserId },
            { userId: targetUserId },
          ],
        },
      },
      include: this.chatInclude(),
    });

    return this.toChatResponse(chat, currentUserId);
  }

  async getChats(currentUserId: string) {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId: currentUserId },
      include: {
        chat: {
          include: this.chatInclude(),
        },
      },
      orderBy: {
        chat: {
          updatedAt: "desc",
        },
      },
    });

    const chats = await Promise.all(
      memberships.map((membership) =>
        this.toChatResponse(membership.chat, currentUserId),
      ),
    );

    return chats.sort((left, right) => {
      const leftTime = left.lastMessageAt
        ? new Date(left.lastMessageAt).getTime()
        : new Date(left.updatedAt).getTime();
      const rightTime = right.lastMessageAt
        ? new Date(right.lastMessageAt).getTime()
        : new Date(right.updatedAt).getTime();

      return rightTime - leftTime;
    });
  }

  private findPrivateChat(currentUserId: string, targetUserId: string) {
    return this.prisma.chat.findFirst({
      where: {
        type: "private",
        AND: [
          { members: { some: { userId: currentUserId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: this.chatInclude(),
    });
  }

  private async toChatResponse(chat: ChatWithMembers, currentUserId: string) {
    const partner = chat.members.find(
      (member) => member.userId !== currentUserId,
    )?.user;
    const lastMessage = chat.messages[0] ?? null;
    const unreadCount = await this.prisma.messageReceipt.count({
      where: {
        userId: currentUserId,
        readAt: null,
        message: {
          chatId: chat.id,
          senderId: { not: currentUserId },
          deletedAt: null,
        },
      },
    });

    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      lastMessageAt: lastMessage?.createdAt ?? null,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            text: lastMessage.text,
            mediaUrl: lastMessage.mediaUrl,
            mediaType: lastMessage.mediaType,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
            sender: lastMessage.sender,
          }
        : null,
      partner: partner
        ? {
            id: partner.id,
            username: partner.username,
            displayName: partner.displayName,
            nameEmoji: partner.nameEmoji,
            avatarUrl: partner.avatarUrl,
          }
        : null,
    };
  }

  private chatInclude() {
    return {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              nameEmoji: true,
              avatarUrl: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          text: true,
          mediaUrl: true,
          mediaType: true,
          createdAt: true,
          senderId: true,
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              nameEmoji: true,
              avatarUrl: true,
            },
          },
        },
      },
    } as const;
  }
}
