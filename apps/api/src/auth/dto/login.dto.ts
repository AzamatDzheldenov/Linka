import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString({ message: "Identifier must be a string" })
  @MinLength(3, { message: "Identifier must be at least 3 characters long" })
  @MaxLength(254, { message: "Identifier must be at most 254 characters long" })
  identifier!: string;

  @IsString({ message: "Password must be a string" })
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(128, { message: "Password must be at most 128 characters long" })
  password!: string;
}
