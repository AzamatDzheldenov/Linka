import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
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
import { UpdateMeDto } from "./dto/update-me.dto";
import { UsersService } from "./users.service";

const AVATAR_UPLOAD_DIR = join(__dirname, "..", "..", "uploads", "avatars");
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

type UploadedAvatarFile = {
  filename: string;
};

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMe(request.user.id);
  }

  @Patch("me")
  updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(request.user.id, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
          callback(null, AVATAR_UPLOAD_DIR);
        },
        filename: (_request, file, callback) => {
          callback(null, `${randomUUID()}${getAvatarExtension(file.mimetype)}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException("Only JPEG, PNG and WebP images are allowed"),
            false,
          );
          return;
        }

        callback(null, true);
      },
      limits: {
        fileSize: MAX_AVATAR_SIZE_BYTES,
      },
    }),
  )
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: UploadedAvatarFile,
  ) {
    if (!file) {
      throw new BadRequestException("Avatar file is required");
    }

    return this.usersService.updateAvatar(
      request.user.id,
      `/uploads/avatars/${file.filename}`,
    );
  }

  @Get("search")
  searchUsers(
    @Req() request: AuthenticatedRequest,
    @Query("q") query?: string,
  ) {
    return this.usersService.searchUsers(request.user.id, query);
  }
}

function getAvatarExtension(mimeType: string) {
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
