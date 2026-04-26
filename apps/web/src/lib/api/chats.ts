import { apiRequest } from "./client";

export type ChatPartner = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type Chat = {
  id: string;
  type: "private" | string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  partner: ChatPartner | null;
};

export async function createPrivateChat(userId: string) {
  return apiRequest<Chat>("/chats/private", {
    method: "POST",
    body: { userId },
  });
}

export async function getChats() {
  return apiRequest<Chat[]>("/chats", {
    method: "GET",
  });
}
