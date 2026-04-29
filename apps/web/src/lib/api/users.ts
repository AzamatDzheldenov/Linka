import { AuthUser, useAuthStore } from "@/store/auth-store";
import { apiRequest } from "./client";

export type UpdateMeInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  nameEmoji?: string;
  avatarUrl?: string;
};

export type PublicUserProfile = Omit<AuthUser, "email">;

export type UserSettings = {
  id: string;
  userId: string;
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  allowSearchByUsername: boolean;
  messagePreviewEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpdateUserSettingsInput = Partial<
  Pick<
    UserSettings,
    | "showOnlineStatus"
    | "showReadReceipts"
    | "allowSearchByUsername"
    | "messagePreviewEnabled"
    | "pushEnabled"
    | "soundEnabled"
  >
>;

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

export async function getUserProfile(username: string) {
  return apiRequest<PublicUserProfile>(`/users/${encodeURIComponent(username)}`, {
    method: "GET",
  });
}

export async function getUserSettings() {
  return apiRequest<UserSettings>("/users/me/settings", {
    method: "GET",
  });
}

export async function updateUserSettings(input: UpdateUserSettingsInput) {
  return apiRequest<UserSettings>("/users/me/settings", {
    method: "PATCH",
    body: input,
  });
}

export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  const user = await apiRequest<AuthUser>("/users/me/avatar", {
    method: "POST",
    body: formData,
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
