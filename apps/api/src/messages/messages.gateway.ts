import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { MessagesEventsService } from "./messages-events.service";
import { MessagesService } from "./messages.service";

type AuthenticatedSocket = Socket & {
  data: {
    userId?: string;
  };
};

type AccessTokenPayload = {
  sub: string;
};

type TypingPayload = {
  chatId?: string;
};

type MarkAsReadPayload = {
  chatId?: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_URL ?? process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  },
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesEventsService: MessagesEventsService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.messagesEventsService.setServer(server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    const accessToken = this.getAccessToken(client);

    if (!accessToken) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        accessToken,
        {
          secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
        },
      );

      if (!payload.sub) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      await client.join(this.messagesEventsService.getUserRoomName(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    client.removeAllListeners();
  }

  @SubscribeMessage("joinChat")
  async joinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { chatId?: string },
  ) {
    const userId = this.requireUserId(client);
    const chatId = this.requireChatId(payload.chatId);

    await this.messagesService.assertChatMember(userId, chatId);
    await client.join(this.getRoomName(chatId));
    const deliveredUpdates = await this.messagesService.markDelivered(userId, chatId);
    this.emitReceiptUpdates("message:delivered", deliveredUpdates);

    return { chatId };
  }

  @SubscribeMessage("leaveChat")
  async leaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { chatId?: string },
  ) {
    const chatId = this.requireChatId(payload.chatId);
    await client.leave(this.getRoomName(chatId));

    return { chatId };
  }

  @SubscribeMessage("sendMessage")
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { chatId?: string; text?: string },
  ) {
    const userId = this.requireUserId(client);
    const chatId = this.requireChatId(payload.chatId);
    const text = payload.text?.trim();

    if (!text) {
      throw new WsException("Message text cannot be empty");
    }

    const message = await this.messagesService.createMessage(userId, {
      chatId,
      text,
    });

    this.messagesEventsService.emitNewMessage(chatId, message);
    return message;
  }

  @SubscribeMessage("typing:start")
  async typingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload,
  ) {
    return this.emitTypingEvent(client, payload, "userTyping:start");
  }

  @SubscribeMessage("markAsRead")
  async markAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: MarkAsReadPayload,
  ) {
    const userId = this.requireUserId(client);
    const chatId = this.requireChatId(payload.chatId);
    const readUpdates = await this.messagesService.markRead(userId, chatId);
    this.emitReceiptUpdates("message:read", readUpdates);

    return { chatId };
  }

  @SubscribeMessage("typing:stop")
  async typingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload,
  ) {
    return this.emitTypingEvent(client, payload, "userTyping:stop");
  }

  private async emitTypingEvent(
    client: AuthenticatedSocket,
    payload: TypingPayload,
    eventName: "userTyping:start" | "userTyping:stop",
  ) {
    const userId = this.requireUserId(client);
    const chatId = this.requireChatId(payload.chatId);
    const user = await this.messagesService.getTypingUser(userId, chatId);

    client.to(this.getRoomName(chatId)).emit(eventName, {
      chatId,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
    });

    return { chatId };
  }

  private emitReceiptUpdates(
    eventName: "message:delivered" | "message:read",
    updates: Array<{
      senderId: string;
      chatId: string;
      userId: string;
      messageIds: string[];
      deliveredAt?: Date;
      readAt?: Date;
    }>,
  ) {
    updates.forEach((update) => {
      this.messagesEventsService.emitToUser(update.senderId, eventName, update);
    });
  }

  private getAccessToken(client: Socket) {
    const authToken = client.handshake.auth?.accessToken;

    if (typeof authToken === "string") {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice("Bearer ".length);
    }

    return null;
  }

  private requireUserId(client: AuthenticatedSocket) {
    if (!client.data.userId) {
      throw new WsException("Unauthorized");
    }

    return client.data.userId;
  }

  private requireChatId(chatId?: string) {
    if (!chatId) {
      throw new WsException("Chat id is required");
    }

    return chatId;
  }

  private getRoomName(chatId: string) {
    return this.messagesEventsService.getRoomName(chatId);
  }
}
