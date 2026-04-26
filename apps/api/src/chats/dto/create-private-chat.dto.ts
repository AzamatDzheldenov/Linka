import { IsUUID } from "class-validator";

export class CreatePrivateChatDto {
  @IsUUID("4", { message: "User id must be a valid UUID" })
  userId!: string;
}
