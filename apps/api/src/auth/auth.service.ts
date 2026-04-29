import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

export const REFRESH_TOKEN_COOKIE = "refreshToken";

type AuthUser = {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  nameEmoji: string | null;
  avatarUrl: string | null;
  createdAt: Date;
};

type RefreshTokenPayload = {
  sub: string;
  jti: string;
  type: "refresh";
};

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn =
    process.env.JWT_ACCESS_EXPIRES_IN ?? "15m";
  private readonly refreshTokenExpiresIn =
    process.env.JWT_REFRESH_EXPIRES_IN ?? "30d";
  private readonly refreshTokenTtlMs = Number(
    process.env.JWT_REFRESH_TTL_MS ?? 30 * 24 * 60 * 60 * 1000,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName?.trim() || null;
    const nameEmoji = dto.nameEmoji?.trim() || null;
    const username = normalizeUsername(dto.username);
    const email = dto.email.trim().toLowerCase();

    if (!firstName) {
      throw new BadRequestException("First name is required");
    }

    if (!username) {
      throw new BadRequestException("Username is required");
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException("Username or email is already taken");
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        displayName: formatDisplayName(firstName, lastName),
        bio: dto.bio?.trim() || null,
        nameEmoji,
        avatarUrl: dto.avatarUrl?.trim() || null,
      },
      select: this.safeUserSelect(),
    });

    return this.issueAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const isEmailIdentifier = identifier.includes("@");
    const where = isEmailIdentifier
      ? { email: identifier.toLowerCase() }
      : { username: normalizeUsername(identifier) };

    const user = await this.prisma.user.findFirst({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        passwordHash: true,
        displayName: true,
        bio: true,
        nameEmoji: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueAuthResponse(this.toAuthUser(user));
  }

  async isUsernameAvailable(username: string) {
    const normalizedUsername = normalizeUsername(username);

    if (!isValidUsername(normalizedUsername)) {
      throw new BadRequestException("Invalid username");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    return {
      username: normalizedUsername,
      available: !existingUser,
    };
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is missing");
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: { select: this.safeUserSelect() } },
    });

    if (
      !storedToken ||
      storedToken.userId !== payload.sub ||
      storedToken.expiresAt <= new Date() ||
      !(await argon2.verify(storedToken.tokenHash, refreshToken))
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const deletedToken = await this.prisma.refreshToken.deleteMany({
      where: {
        id: storedToken.id,
        userId: payload.sub,
      },
    });

    if (deletedToken.count !== 1) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.issueAuthResponse(storedToken.user);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshToken.deleteMany({
        where: {
          id: payload.jti,
          userId: payload.sub,
        },
      });
    } catch {
      return;
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.safeUserSelect(),
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }

  private async issueAuthResponse(user: AuthUser) {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.username },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
        expiresIn: this.accessTokenExpiresIn as never,
      },
    );

    const refreshTokenId = randomUUID();
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTokenTtlMs);
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: refreshTokenId, type: "refresh" },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
        expiresIn: this.refreshTokenExpiresIn as never,
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        tokenHash: await argon2.hash(refreshToken),
        userId: user.id,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return {
      refreshToken,
      refreshTokenExpiresAt,
      body: {
        accessToken,
        user,
      },
    };
  }

  private async verifyRefreshToken(token: string) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (!payload.sub || !payload.jti || payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return payload;
  }

  private safeUserSelect() {
    return {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      displayName: true,
      bio: true,
      nameEmoji: true,
      avatarUrl: true,
      createdAt: true,
    } as const;
  }

  private toAuthUser(user: AuthUser & { passwordHash: string }): AuthUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}

function formatDisplayName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ");
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function isValidUsername(username: string) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}
