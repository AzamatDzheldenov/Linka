import { IsOptional, IsString, Length } from "class-validator";

export class UpdateChatSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 80, { message: "Title must be between 1 and 80 characters" })
  title?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  wallpaperUrl?: string;
}
