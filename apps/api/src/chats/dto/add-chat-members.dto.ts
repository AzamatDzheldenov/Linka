import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class AddChatMembersDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100, { message: "A chat can include up to 100 new members" })
  @IsUUID("4", { each: true, message: "Member ids must be valid UUIDs" })
  memberIds!: string[];
}
