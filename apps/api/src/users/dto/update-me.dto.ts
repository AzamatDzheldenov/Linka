import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateMeDto {
  @IsOptional()
  @IsString({ message: "Username must be a string" })
  @MinLength(3, { message: "Username must be at least 3 characters long" })
  @MaxLength(32, { message: "Username must be at most 32 characters long" })
  username?: string;

  @IsOptional()
  @IsString({ message: "Display name must be a string" })
  @MaxLength(80, { message: "Display name must be at most 80 characters long" })
  displayName?: string;

  @IsOptional()
  @IsUrl({}, { message: "Avatar URL must be a valid URL" })
  @MaxLength(2048, { message: "Avatar URL must be at most 2048 characters long" })
  avatarUrl?: string;
}
