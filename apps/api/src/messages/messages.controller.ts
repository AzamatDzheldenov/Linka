import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
import { Request } from "express";
import { mkdir, writeFile } from "fs/promises";
import { memoryStorage } from "multer";
import { join } from "path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MessagesEventsService } from "./messages-events.service";
import { MessagesService } from "./messages.service";

const MESSAGE_UPLOAD_DIR = join(__dirname, "..", "..", "uploads", "messages");
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
  ) {
    return this.messagesService.getMessages(request.user.id, chatId);
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

    await this.messagesService.assertChatMember(request.user.id, chatId);

    const filename = `${randomUUID()}${getMediaExtension(file.mimetype)}`;
    await mkdir(MESSAGE_UPLOAD_DIR, { recursive: true });
    await writeFile(join(MESSAGE_UPLOAD_DIR, filename), file.buffer);

    const message = await this.messagesService.createMediaMessage(request.user.id, {
      chatId,
      mediaUrl: `/uploads/messages/${filename}`,
      mediaType: getMediaType(file.mimetype),
      text,
    });

    this.messagesEventsService.emitNewMessage(chatId, message);
    const memberIds = await this.messagesService.getChatMemberIds(chatId);
    memberIds.forEach((memberId) => {
      this.messagesEventsService.emitChatNewMessage(memberId, message);
    });
    return message;
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
