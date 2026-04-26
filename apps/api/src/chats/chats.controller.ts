import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreatePrivateChatDto } from "./dto/create-private-chat.dto";
import { ChatsService } from "./chats.service";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post("private")
  createPrivateChat(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePrivateChatDto,
  ) {
    return this.chatsService.createPrivateChat(request.user.id, dto.userId);
  }

  @Get()
  getChats(@Req() request: AuthenticatedRequest) {
    return this.chatsService.getChats(request.user.id);
  }
}
