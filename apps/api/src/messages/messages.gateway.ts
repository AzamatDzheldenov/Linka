import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { MessagesService } from "./messages.service";

type AuthenticatedSocket = Socket & {
  data: {
    userId?: string;
  };
};

type AccessTokenPayload = {
  sub: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_URL ?? process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService,
  ) {}

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

    this.server.to(this.getRoomName(chatId)).emit("newMessage", message);
    return message;
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
    return `chat:${chatId}`;
  }
}
