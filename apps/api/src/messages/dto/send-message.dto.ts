import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsUUID("4", { message: "Chat id must be a valid UUID" })
  chatId!: string;

  @IsString({ message: "Message text must be a string" })
  @MinLength(1, { message: "Message text cannot be empty" })
  @MaxLength(4000, { message: "Message text must be at most 4000 characters long" })
  text!: string;
}
