import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";

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

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId: dto.chatId,
          senderId: userId,
          text: dto.text.trim(),
        },
        select: this.messageSelect(),
      }),
      this.prisma.chat.update({
        where: { id: dto.chatId },
        data: { updatedAt: new Date() },
        select: { id: true },
      }),
    ]);

    return message;
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
          avatarUrl: true,
        },
      },
    } as const;
  }
}
