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

    return memberships.map((membership) =>
      this.toChatResponse(membership.chat, currentUserId),
    );
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

  private toChatResponse(chat: ChatWithMembers, currentUserId: string) {
    const partner = chat.members.find(
      (member) => member.userId !== currentUserId,
    )?.user;

    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      partner: partner
        ? {
            id: partner.id,
            username: partner.username,
            displayName: partner.displayName,
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
              avatarUrl: true,
            },
          },
        },
      },
    } as const;
  }
}
