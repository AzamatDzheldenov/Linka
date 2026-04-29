import { IsBoolean, IsOptional } from "class-validator";

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsBoolean({ message: "Online status setting must be boolean" })
  showOnlineStatus?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Read receipts setting must be boolean" })
  showReadReceipts?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Username search setting must be boolean" })
  allowSearchByUsername?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Message preview setting must be boolean" })
  messagePreviewEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Push notifications setting must be boolean" })
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: "Sound setting must be boolean" })
  soundEnabled?: boolean;
}
