import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService, REFRESH_TOKEN_COOKIE } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.body;
  }

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.body;
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.body;
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(refreshToken);
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.refreshCookieOptions());
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user.id);
  }

  @Get("username-available")
  async usernameAvailable(@Query("username") username?: string) {
    return this.authService.isUsernameAvailable(username ?? "");
  }

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
    expiresAt: Date,
  ) {
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.refreshCookieOptions(),
      expires: expiresAt,
    });
  }

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/auth",
    };
  }
}
