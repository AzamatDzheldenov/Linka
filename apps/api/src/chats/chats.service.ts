import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AddChatMembersDto } from "./dto/add-chat-members.dto";
import { CreateSharedChatDto } from "./dto/create-shared-chat.dto";
import { UpdateChatMemberRoleDto } from "./dto/update-chat-member-role.dto";
import { UpdateChatSettingsDto } from "./dto/update-chat-settings.dto";

type ChatWithMembers = {
  id: string;
  type: string;
  title: string | null;
  avatarUrl: string | null;
  wallpaperUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    role: string;
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

  async createSharedChat(
    currentUserId: string,
    type: "group" | "channel",
    dto: CreateSharedChatDto,
  ) {
    const title = dto.title.trim();

    if (!title) {
      throw new BadRequestException("Chat title is required");
    }

    const memberIds = [...new Set(dto.memberIds)].filter(
      (memberId) => memberId !== currentUserId,
    );

    if (!memberIds.length) {
      throw new BadRequestException("Select at least one user");
    }

    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: {
        id: true,
        settings: {
          select: {
            requireGroupInviteApproval: true,
          },
        },
      },
    });

    if (existingUsers.length !== memberIds.length) {
      throw new NotFoundException("One or more users were not found");
    }

    const directMemberIds =
      type === "group"
        ? existingUsers
            .filter((user) => user.settings?.requireGroupInviteApproval !== true)
            .map((user) => user.id)
        : memberIds;
    const invitedMemberIds =
      type === "group"
        ? existingUsers
            .filter((user) => user.settings?.requireGroupInviteApproval === true)
            .map((user) => user.id)
        : [];

    const chat = await this.prisma.chat.create({
      data: {
        type,
        title,
        members: {
          create: [
            { userId: currentUserId, role: "owner" },
            ...directMemberIds.map((memberId) => ({
              userId: memberId,
              role: type === "channel" ? "subscriber" : "member",
            })),
          ],
        },
        invites: {
          create: invitedMemberIds.map((memberId) => ({
            inviterId: currentUserId,
            inviteeId: memberId,
          })),
        },
      },
      include: this.chatInclude(),
    });

    return this.toChatResponse(chat, currentUserId);
  }

  async getPendingInvites(currentUserId: string) {
    return this.prisma.groupInvite.findMany({
      where: {
        inviteeId: currentUserId,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        chat: {
          select: {
            id: true,
            type: true,
            title: true,
            avatarUrl: true,
            members: {
              select: { id: true },
            },
          },
        },
        inviter: {
          select: {
            id: true,
            username: true,
            displayName: true,
            nameEmoji: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async respondToInvite(
    currentUserId: string,
    inviteId: string,
    status: "accepted" | "declined",
  ) {
    const invite = await this.prisma.groupInvite.findFirst({
      where: {
        id: inviteId,
        inviteeId: currentUserId,
        status: "pending",
      },
      select: {
        id: true,
        chatId: true,
      },
    });

    if (!invite) {
      throw new NotFoundException("Invite not found");
    }

    if (status === "accepted") {
      await this.prisma.$transaction([
        this.prisma.chatMember.create({
          data: {
            chatId: invite.chatId,
            userId: currentUserId,
            role: "member",
          },
        }),
        this.prisma.groupInvite.update({
          where: { id: invite.id },
          data: {
            status,
            respondedAt: new Date(),
          },
        }),
      ]);

      const chat = await this.prisma.chat.findUniqueOrThrow({
        where: { id: invite.chatId },
        include: this.chatInclude(),
      });

      return this.toChatResponse(chat, currentUserId);
    }

    return this.prisma.groupInvite.update({
      where: { id: invite.id },
      data: {
        status,
        respondedAt: new Date(),
      },
    });
  }

  async addMembers(
    currentUserId: string,
    chatId: string,
    dto: AddChatMembersDto,
  ) {
    await this.assertCanManageChat(currentUserId, chatId);

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true },
    });

    if (!chat || chat.type === "private") {
      throw new BadRequestException("Members can only be added to shared chats");
    }

    const existingMemberships = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    const existingIds = new Set(existingMemberships.map((member) => member.userId));
    const memberIds = [...new Set(dto.memberIds)].filter(
      (memberId) => memberId !== currentUserId && !existingIds.has(memberId),
    );

    if (!memberIds.length) {
      const nextChat = await this.prisma.chat.findUniqueOrThrow({
        where: { id: chatId },
        include: this.chatInclude(),
      });
      return this.toChatResponse(nextChat, currentUserId);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: {
        id: true,
        settings: { select: { requireGroupInviteApproval: true } },
      },
    });

    const directMemberIds =
      chat.type === "group"
        ? users
            .filter((user) => user.settings?.requireGroupInviteApproval !== true)
            .map((user) => user.id)
        : memberIds;
    const invitedMemberIds =
      chat.type === "group"
        ? users
            .filter((user) => user.settings?.requireGroupInviteApproval === true)
            .map((user) => user.id)
        : [];

    await this.prisma.$transaction([
      ...(directMemberIds.length
        ? [
            this.prisma.chatMember.createMany({
              data: directMemberIds.map((memberId) => ({
                chatId,
                userId: memberId,
                role: chat.type === "channel" ? "subscriber" : "member",
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
      ...(invitedMemberIds.length
        ? [
            this.prisma.groupInvite.createMany({
              data: invitedMemberIds.map((memberId) => ({
                chatId,
                inviterId: currentUserId,
                inviteeId: memberId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    const nextChat = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: this.chatInclude(),
    });
    return this.toChatResponse(nextChat, currentUserId);
  }

  async updateChatSettings(
    currentUserId: string,
    chatId: string,
    dto: UpdateChatSettingsDto,
  ) {
    await this.assertCanManageChat(currentUserId, chatId);

    const data: {
      title?: string;
      avatarUrl?: string | null;
      wallpaperUrl?: string | null;
    } = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException("Chat title is required");
      }
      data.title = title;
    }

    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl.trim() || null;
    }

    if (dto.wallpaperUrl !== undefined) {
      data.wallpaperUrl = dto.wallpaperUrl.trim() || null;
    }

    const chat = await this.prisma.chat.update({
      where: { id: chatId },
      data,
      include: this.chatInclude(),
    });

    return this.toChatResponse(chat, currentUserId);
  }

  async updateMemberRole(
    currentUserId: string,
    chatId: string,
    dto: UpdateChatMemberRoleDto,
  ) {
    return this.updateMemberRoleByUserId(
      currentUserId,
      chatId,
      dto.userId,
      dto.role,
    );
  }

  async updateMemberRoleByUserId(
    currentUserId: string,
    chatId: string,
    userId: string,
    role: "admin" | "member" | "subscriber",
  ) {
    await this.assertOwner(currentUserId, chatId);

    if (currentUserId === userId) {
      throw new BadRequestException("Owner role cannot be changed");
    }

    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: { select: { type: true } },
      },
    });

    if (!membership || !["group", "channel"].includes(membership.chat.type)) {
      throw new BadRequestException("Only shared chat members can change roles");
    }

    if (membership.role === "owner") {
      throw new BadRequestException("Owner role cannot be changed");
    }

    if (membership.chat.type === "group" && !["admin", "member"].includes(role)) {
      throw new BadRequestException("Group role must be admin or member");
    }

    if (
      membership.chat.type === "channel" &&
      !["admin", "subscriber"].includes(role)
    ) {
      throw new BadRequestException("Channel role must be admin or subscriber");
    }

    await this.prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      data: { role },
    });

    const chat = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: this.chatInclude(),
    });

    return this.toChatResponse(chat, currentUserId);
  }

  async removeMember(currentUserId: string, chatId: string, userId: string) {
    await this.assertCanManageChat(currentUserId, chatId);

    if (currentUserId === userId) {
      throw new BadRequestException("Owner or admin cannot remove themselves");
    }

    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: { select: { type: true } },
      },
    });

    if (!membership || !["group", "channel"].includes(membership.chat.type)) {
      throw new BadRequestException("Members can only be removed from shared chats");
    }

    if (membership.role === "owner") {
      throw new BadRequestException("Owner cannot be removed");
    }

    await this.prisma.chatMember.delete({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
    });

    const chat = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: this.chatInclude(),
    });

    return this.toChatResponse(chat, currentUserId);
  }

  async getChannelSubscribers(currentUserId: string, chatId: string) {
    await this.assertChannelMember(currentUserId, chatId);

    return this.prisma.chatMember.findMany({
      where: {
        chatId,
        role: "subscriber",
      },
      orderBy: { joinedAt: "desc" },
      select: {
        joinedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
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
    const currentMember = chat.members.find(
      (member) => member.userId === currentUserId,
    );
    const partner =
      chat.type === "private"
        ? chat.members.find((member) => member.userId !== currentUserId)?.user
        : null;
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
      avatarUrl: chat.avatarUrl,
      wallpaperUrl: chat.wallpaperUrl,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      memberCount: chat.members.length,
      currentUserRole: currentMember?.role ?? null,
      members: chat.members.map((member) => ({
        role: member.role,
        user: {
          id: member.user.id,
          username: member.user.username,
          displayName: member.user.displayName,
          nameEmoji: member.user.nameEmoji,
          avatarUrl: member.user.avatarUrl,
        },
      })),
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

  async assertCanManageChat(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: { select: { type: true } },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    if (
      !["group", "channel"].includes(membership.chat.type) ||
      !["owner", "admin"].includes(membership.role)
    ) {
      throw new ForbiddenException("Only chat admins can manage this chat");
    }
  }

  private async assertChannelMember(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        chat: { select: { type: true } },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this chat");
    }

    if (membership.chat.type !== "channel") {
      throw new BadRequestException("Subscribers are only available for channels");
    }
  }

  private async assertOwner(userId: string, chatId: string) {
    const membership = await this.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId,
        },
      },
      select: {
        role: true,
        chat: { select: { type: true } },
      },
    });

    if (
      !membership ||
      !["group", "channel"].includes(membership.chat.type) ||
      membership.role !== "owner"
    ) {
      throw new ForbiddenException("Only the chat owner can change admins");
    }
  }
}
