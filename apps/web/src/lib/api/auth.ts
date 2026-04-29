import {
  AuthUser,
  setAccessToken,
  useAuthStore,
} from "../../store/auth-store";
import { apiRequest } from "./client";
import { disconnectSocket } from "@/lib/socket/client";
import { getMe } from "./users";

export type RegisterInput = {
  firstName: string;
  lastName?: string;
  username: string;
  email: string;
  password: string;
  displayName?: string;
  bio?: string;
  nameEmoji?: string;
  avatarUrl?: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export async function register(input: RegisterInput) {
  const response = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });

  await persistAuthResponse(response);
  return response;
}

export async function login(input: LoginInput) {
  const response = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });

  await persistAuthResponse(response);
  return response;
}

export async function checkUsernameAvailability(username: string) {
  const params = new URLSearchParams({ username });

  return apiRequest<{ username: string; available: boolean }>(
    `/auth/username-available?${params.toString()}`,
    {
      method: "GET",
      auth: false,
    },
  );
}

export async function refresh() {
  const response = await apiRequest<AuthResponse>("/auth/refresh", {
    method: "POST",
    auth: false,
  });

  await persistAuthResponse(response);
  return response;
}

export async function logout() {
  await apiRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    auth: false,
  });

  disconnectSocket();
  useAuthStore.getState().clearAuth();
}

async function persistAuthResponse(response: AuthResponse) {
  setAccessToken(response.accessToken);
  await getMe();
}

export { getMe };
