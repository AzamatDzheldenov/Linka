import { IsIn } from "class-validator";

export class RespondGroupInviteDto {
  @IsIn(["accepted", "declined"], {
    message: "Status must be accepted or declined",
  })
  status!: "accepted" | "declined";
}
