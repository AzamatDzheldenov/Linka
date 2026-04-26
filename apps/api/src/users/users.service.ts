import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateMeDto } from "./dto/update-me.dto";

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

  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: {
      username?: string;
      displayName?: string | null;
      avatarUrl?: string | null;
    } = {};

    if (dto.username !== undefined) {
      const username = dto.username.trim();
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

    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName.trim() || null;
    }

    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl.trim() || null;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: this.safeUserSelect(),
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
      username: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }
}
