import { IsIn, IsString } from "class-validator";
import { SUPPORTED_MESSAGE_REACTIONS } from "../message-reactions.constants";

export class ToggleMessageReactionDto {
  @IsString({ message: "Reaction must be a string" })
  @IsIn(SUPPORTED_MESSAGE_REACTIONS, { message: "unsupported reaction" })
  emoji!: string;
}
