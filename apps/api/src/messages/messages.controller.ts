import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessagesService } from "./messages.service";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("chats/:chatId/messages")
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getMessages(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
  ) {
    return this.messagesService.getMessages(request.user.id, chatId);
  }
}
