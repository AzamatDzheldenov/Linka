import { AuthUser, useAuthStore } from "@/store/auth-store";
import { apiRequest } from "./client";

export type UpdateMeInput = {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
};

export async function getMe() {
  const user = await apiRequest<AuthUser>("/users/me", {
    method: "GET",
  });

  useAuthStore.getState().setCurrentUser(user);
  return user;
}

export async function updateMe(input: UpdateMeInput) {
  const user = await apiRequest<AuthUser>("/users/me", {
    method: "PATCH",
    body: input,
  });

  useAuthStore.getState().setCurrentUser(user);
  return user;
}

export async function searchUsers(query: string) {
  const params = new URLSearchParams({ q: query });

  return apiRequest<AuthUser[]>(`/users/search?${params.toString()}`, {
    method: "GET",
  });
}
