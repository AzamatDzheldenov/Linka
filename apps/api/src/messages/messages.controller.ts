import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { mkdir, unlink, writeFile } from "fs/promises";
import { memoryStorage } from "multer";
import { join } from "path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessagesEventsService } from "./messages-events.service";
import { MESSAGE_UPLOAD_DIR, MessagesService } from "./messages.service";

const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "audio/mpeg",
  "audio/webm",
  "application/pdf",
]);

type UploadedMediaFile = {
  buffer: Buffer;
  mimetype: string;
};

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("chats/:chatId")
@SkipThrottle({ short: true })
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesEventsService: MessagesEventsService,
  ) {}

  @Get("messages")
  getMessages(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.messagesService.getMessages(request.user.id, chatId, cursor);
  }

  @Delete("messages/:messageId")
  async deleteMessage(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @Param("messageId") messageId: string,
  ) {
    const message = await this.messagesService.deleteMessage(
      request.user.id,
      chatId,
      messageId,
    );
    this.messagesEventsService.emitMessageUpdated(chatId, message);
    return message;
  }

  @Post("media")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_MEDIA_MIME_TYPES.has(file.mimetype)) {
          callback(new BadRequestException("Unsupported media file type"), false);
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: MAX_MEDIA_SIZE_BYTES,
      },
    }),
  )
  async uploadMedia(
    @Req() request: AuthenticatedRequest,
    @Param("chatId") chatId: string,
    @UploadedFile() file?: UploadedMediaFile,
    @Body("text") text?: string,
  ) {
    if (!file) {
      throw new BadRequestException("Media file is required");
    }

    await this.messagesService.assertCanSendMessage(request.user.id, chatId);

    const filename = `${randomUUID()}${getMediaExtension(file.mimetype)}`;
    const filePath = join(MESSAGE_UPLOAD_DIR, filename);

    await mkdir(MESSAGE_UPLOAD_DIR, { recursive: true });

    try {
      await writeFile(filePath, file.buffer);

      const message = await this.messagesService.createMediaMessage(request.user.id, {
        chatId,
        mediaUrl: `/messages/media/${filename}`,
        mediaType: getMediaType(file.mimetype),
        text,
      });

      this.messagesEventsService.emitNewMessage(chatId, message);
      const memberIds = await this.messagesService.getChatMemberIds(chatId);
      memberIds.forEach((memberId) => {
        this.messagesEventsService.emitChatNewMessage(memberId, message);
      });
      return message;
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
  }
}

@Controller("messages")
@SkipThrottle({ short: true })
@UseGuards(JwtAuthGuard)
export class MessageMediaController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get("media/:fileId")
  async getMedia(
    @Req() request: AuthenticatedRequest,
    @Param("fileId") fileId: string,
    @Res() response: Response,
  ) {
    const mediaFile = await this.messagesService.getMediaFile(
      request.user.id,
      fileId,
    );

    if (mediaFile.contentType) {
      response.type(mediaFile.contentType);
    }

    return response.sendFile(mediaFile.filePath);
  }
}

function getMediaType(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "document";
}

function getMediaExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  if (mimeType === "video/mp4") {
    return ".mp4";
  }

  if (mimeType === "audio/mpeg") {
    return ".mp3";
  }

  if (mimeType === "audio/webm") {
    return ".webm";
  }

  if (mimeType === "application/pdf") {
    return ".pdf";
  }

  return "";
}
