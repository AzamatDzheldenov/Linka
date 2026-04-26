import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsString({ message: "Username must be a string" })
  @MinLength(3, { message: "Username must be at least 3 characters long" })
  @MaxLength(32, { message: "Username must be at most 32 characters long" })
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
}
