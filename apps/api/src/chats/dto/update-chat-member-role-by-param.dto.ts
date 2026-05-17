import { IsIn } from "class-validator";

export class UpdateChatMemberRoleByParamDto {
  @IsIn(["admin", "member", "subscriber"], {
    message: "Role must be admin, member or subscriber",
  })
  role!: "admin" | "member" | "subscriber";
}
