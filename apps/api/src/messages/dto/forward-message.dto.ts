import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

export class ForwardMessageDto {
  @IsArray({ message: "Target chat ids must be an array" })
  @ArrayNotEmpty({ message: "Choose at least one target chat" })
  @IsUUID("4", {
    each: true,
    message: "Each target chat id must be a valid UUID",
  })
  targetChatIds!: string[];
}
