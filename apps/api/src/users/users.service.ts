import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UpdateUserSettingsDto } from "./dto/update-user-settings.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getProfileByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: this.publicUserSelect(),
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: {
      firstName?: string;
      lastName?: string | null;
      username?: string;
      displayName?: string | null;
      avatarUrl?: string | null;
      bio?: string | null;
      nameEmoji?: string | null;
    } = {};

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException();
    }

    const firstName =
      dto.firstName !== undefined ? dto.firstName.trim() : currentUser.firstName;
    const lastName =
      dto.lastName !== undefined ? dto.lastName.trim() || null : currentUser.lastName;

    if (!firstName) {
      throw new BadRequestException("First name is required");
    }

    if (dto.firstName !== undefined) {
      data.firstName = firstName;
    }

    if (dto.lastName !== undefined) {
      data.lastName = lastName;
    }

    if (dto.username !== undefined) {
      const username = normalizeUsername(dto.username);

      if (!username) {
        throw new BadRequestException("Username is required");
      }

      const existingUser = await this.prisma.user.findFirst({
        where: {
          username,
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException("Username is already taken");
      }

      data.username = username;
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined || dto.displayName !== undefined) {
      data.displayName =
        dto.displayName !== undefined
          ? dto.displayName.trim() || formatDisplayName(firstName, lastName)
          : formatDisplayName(firstName, lastName);
    }

    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl.trim() || null;
    }

    if (dto.bio !== undefined) {
      data.bio = dto.bio.trim() || null;
    }

    if (dto.nameEmoji !== undefined) {
      data.nameEmoji = dto.nameEmoji.trim() || null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: this.safeUserSelect(),
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: this.safeUserSelect(),
    });
  }

  async getSettings(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async updateSettings(userId: string, dto: UpdateUserSettingsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        ...dto,
      },
    });
  }

  async searchUsers(currentUserId: string, query?: string) {
    const normalizedQuery = query?.trim();

    if (!normalizedQuery) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        AND: [
          {
            OR: [
              { settings: null },
              {
                settings: {
                  is: {
                    allowSearchByUsername: true,
                  },
                },
              },
            ],
          },
          {
            OR: [
              {
                username: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
              {
                displayName: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
              {
                firstName: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: normalizedQuery,
                  mode: "insensitive",
                },
              },
            ],
          },
        ],
      },
      select: this.safeUserSelect(),
      orderBy: [{ username: "asc" }],
      take: 20,
    });
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
      updatedAt: true,
    } as const;
  }

  private publicUserSelect() {
    return {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      displayName: true,
      bio: true,
      nameEmoji: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}

function formatDisplayName(firstName: string, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ");
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
