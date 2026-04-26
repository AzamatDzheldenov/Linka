import { Body, Controller, Get, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UsersService } from "./users.service";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMe(request.user.id);
  }

  @Patch("me")
  updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(request.user.id, dto);
  }

  @Get("search")
  searchUsers(
    @Req() request: AuthenticatedRequest,
    @Query("q") query?: string,
  ) {
    return this.usersService.searchUsers(request.user.id, query);
  }
}
