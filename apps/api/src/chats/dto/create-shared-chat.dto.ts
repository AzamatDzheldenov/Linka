import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from "class-validator";

export class CreateSharedChatDto {
  @IsString()
  @Length(1, 80, { message: "Title must be between 1 and 80 characters" })
  title!: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100, { message: "A chat can include up to 100 members" })
  @IsUUID("4", { each: true, message: "Member ids must be valid UUIDs" })
  memberIds!: string[];
}
