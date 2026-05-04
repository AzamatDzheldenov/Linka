import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
import { Request } from "express";
import { mkdirSync } from "fs";
import { diskStorage } from "multer";
import { join } from "path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AddChatMembersDto } from "./dto/add-chat-members.dto";
import { CreatePrivateChatDto } from "./dto/create-private-chat.dto";
import { CreateSharedChatDto } from "./dto/create-shared-chat.dto";
import { RespondGroupInviteDto } from "./dto/respond-group-invite.dto";
import { UpdateChatMemberRoleDto } from "./dto/update-chat-member-role.dto";
import { UpdateChatSettingsDto } from "./dto/update-chat-settings.dto";
import { ChatsService } from "./chats.service";

const CHAT_ASSET_UPLOAD_DIR = join(__dirname, "..", "..", "uploads", "chats");
const ALLOWED_CHAT_ASSET_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_CHAT_ASSET_SIZE_BYTES = 8 * 1024 * 1024;

type UploadedChatAssetFile = {
  filename: string;
};

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

  @Post("group")
  createGroupChat(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSharedChatDto,
  ) {
    return this.chatsService.createSharedChat(request.user.id, "group", dto);
  }

  @Post("channel")
  createChannel(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSharedChatDto,
  ) {
    return this.chatsService.createSharedChat(request.user.id, "channel", dto);
  }

  @Get()
  getChats(@Req() request: AuthenticatedRequest) {
    return this.chatsService.getChats(request.user.id);
  }

  @Get("invites")
  getPendingInvites(@Req() request: AuthenticatedRequest) {
    return this.chatsService.getPendingInvites(request.user.id);
  }

  @Post("invites/:inviteId/respond")
  respondToInvite(
    @Req() request: AuthenticatedRequest,
    @Param("inviteId") inviteId: string,
    @Body() dto: RespondGroupInviteDto,
  ) {
    return this.chatsService.respondToInvite(
      request.user.id,
      inviteId,
      dto.status,
    );
  }

  @Patch(":chatId")
  updateChatSettings(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Body() dto: UpdateChatSettingsDto,
  ) {
    return this.chatsService.updateChatSettings(request.user.id, chatId, dto);
  }

  @Post(":chatId/members")
  addMembers(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Body() dto: AddChatMembersDto,
  ) {
    return this.chatsService.addMembers(request.user.id, chatId, dto);
  }

  @Patch(":chatId/members/role")
  updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Body() dto: UpdateChatMemberRoleDto,
  ) {
    return this.chatsService.updateMemberRole(request.user.id, chatId, dto);
  }

  @Post(":chatId/avatar")
  @UseInterceptors(chatAssetInterceptor("avatar"))
  async uploadChatAvatar(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @UploadedFile() file?: UploadedChatAssetFile,
  ) {
    if (!file) {
      throw new BadRequestException("Avatar file is required");
    }

    return this.chatsService.updateChatSettings(request.user.id, chatId, {
      avatarUrl: `/uploads/chats/${file.filename}`,
    });
  }

  @Post(":chatId/wallpaper")
  @UseInterceptors(chatAssetInterceptor("wallpaper"))
  async uploadChatWallpaper(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @UploadedFile() file?: UploadedChatAssetFile,
  ) {
    if (!file) {
      throw new BadRequestException("Wallpaper file is required");
    }

    return this.chatsService.updateChatSettings(request.user.id, chatId, {
      wallpaperUrl: `/uploads/chats/${file.filename}`,
    });
  }
}

function chatAssetInterceptor(fieldName: "avatar" | "wallpaper") {
  return FileInterceptor(fieldName, {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        mkdirSync(CHAT_ASSET_UPLOAD_DIR, { recursive: true });
        callback(null, CHAT_ASSET_UPLOAD_DIR);
      },
      filename: (_request, file, callback) => {
        callback(null, `${randomUUID()}${getChatAssetExtension(file.mimetype)}`);
      },
    }),
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_CHAT_ASSET_MIME_TYPES.has(file.mimetype)) {
        callback(
          new BadRequestException("Only JPEG, PNG and WebP images are allowed"),
          false,
        );
        return;
      }

      callback(null, true);
    },
    limits: {
      fileSize: MAX_CHAT_ASSET_SIZE_BYTES,
    },
  });
}

function getChatAssetExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  return "";
}
