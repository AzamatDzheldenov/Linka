import { IsIn, IsUUID } from "class-validator";

export class UpdateChatMemberRoleDto {
  @IsUUID("4", { message: "User id must be a valid UUID" })
  userId!: string;

  @IsIn(["admin", "member", "subscriber"], {
    message: "Role must be admin, member or subscriber",
  })
  role!: "admin" | "member" | "subscriber";
}
