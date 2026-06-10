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
import { Throttle } from "@nestjs/throttler";
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
  @Throttle({ short: { ttl: 60000, limit: 3 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.body;
  }

  @Post("login")
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresAt);
    return result.body;
  }

  @Post("refresh")
  @Throttle({ short: { ttl: 60000, limit: 20 } })
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
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(refreshToken);
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.refreshCookieOptions());
    return { success: true };
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logoutAll(request.user.id);
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.refreshCookieOptions());
    return result;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user.id);
  }

  @Get("username-available")
  @Throttle({ short: { ttl: 60000, limit: 10 } })
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
    const isProduction = process.env.NODE_ENV === "production";

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ("none" as const) : ("lax" as const),
      path: "/auth",
    };
  }
}
