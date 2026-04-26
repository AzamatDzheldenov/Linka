import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ChatsController } from "./chats.controller";
import { ChatsService } from "./chats.service";

@Module({
  imports: [PrismaModule],
  controllers: [ChatsController],
  providers: [ChatsService],
})
export class ChatsModule {}
