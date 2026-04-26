import { Injectable } from "@nestjs/common";
import { Server } from "socket.io";

@Injectable()
export class MessagesEventsService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitNewMessage(chatId: string, message: unknown) {
    this.server?.to(this.getRoomName(chatId)).emit("newMessage", message);
  }

  emitToUser(userId: string, eventName: string, payload: unknown) {
    this.server?.to(this.getUserRoomName(userId)).emit(eventName, payload);
  }

  getRoomName(chatId: string) {
    return `chat:${chatId}`;
  }

  getUserRoomName(userId: string) {
    return `user:${userId}`;
  }
}
