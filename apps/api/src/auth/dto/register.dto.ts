import {
  IsEmail,
  IsOptional,
  Matches,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsString({ message: "First name must be a string" })
  @MinLength(1, { message: "First name is required" })
  @MaxLength(64, { message: "First name must be at most 64 characters long" })
  firstName!: string;

  @IsOptional()
  @IsString({ message: "Last name must be a string" })
  @MaxLength(64, { message: "Last name must be at most 64 characters long" })
  lastName?: string;

  @IsString({ message: "Username must be a string" })
  @MinLength(3, { message: "Username must be at least 3 characters long" })
  @MaxLength(20, { message: "Username must be at most 20 characters long" })
  @Matches(/^[a-z0-9_]+$/, {
    message: "Username may contain only lowercase letters, numbers and underscores",
  })
  username!: string;

  @IsEmail({}, { message: "Email must be a valid email address" })
  email!: string;

  @IsString({ message: "Password must be a string" })
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(128, { message: "Password must be at most 128 characters long" })
  password!: string;

  @IsOptional()
  @IsString({ message: "Display name must be a string" })
  @MaxLength(80, { message: "Display name must be at most 80 characters long" })
  displayName?: string;

  @IsOptional()
  @IsUrl({}, { message: "Avatar URL must be a valid URL" })
  @MaxLength(2048, { message: "Avatar URL must be at most 2048 characters long" })
  avatarUrl?: string;

  @IsOptional()
  @IsString({ message: "Bio must be a string" })
  @MaxLength(160, { message: "Bio must be at most 160 characters long" })
  bio?: string;

  @IsOptional()
  @IsString({ message: "Name emoji must be a string" })
  @MaxLength(15, { message: "Name emoji must be at most 15 characters long" })
  nameEmoji?: string;
}
