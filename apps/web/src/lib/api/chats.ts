import { Message } from "./messages";
import { apiRequest } from "./client";

export type ChatPartner = {
  id: string;
  username: string;
  displayName: string | null;
  nameEmoji: string | null;
  avatarUrl: string | null;
};

export type ChatType = "private" | "group" | "channel";

export type ChatMember = {
  role: string;
  user: ChatPartner;
};

export type ChannelSubscriber = {
  joinedAt: string;
  user: ChatPartner;
};

export type Chat = {
  id: string;
  type: ChatType;
  title: string | null;
  avatarUrl: string | null;
  wallpaperUrl: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  memberCount: number;
  currentUserRole: string | null;
  members: ChatMember[];
  lastMessage: Message | null;
  lastMessageAt: string | null;
  partner: ChatPartner | null;
};

export type CreateSharedChatInput = {
  title: string;
  memberIds: string[];
};

export type GroupInvite = {
  id: string;
  createdAt: string;
  chat: {
    id: string;
    type: ChatType;
    title: string | null;
    avatarUrl: string | null;
    members: { id: string }[];
  };
  inviter: ChatPartner;
};

export async function createPrivateChat(userId: string) {
  return apiRequest<Chat>("/chats/private", {
    method: "POST",
    body: { userId },
  });
}

export async function createGroupChat(input: CreateSharedChatInput) {
  return apiRequest<Chat>("/chats/group", {
    method: "POST",
    body: input,
  });
}

export async function createChannel(input: CreateSharedChatInput) {
  return apiRequest<Chat>("/chats/channel", {
    method: "POST",
    body: input,
  });
}

export async function getChats() {
  return apiRequest<Chat[]>("/chats", {
    method: "GET",
  });
}

export async function getGroupInvites() {
  return apiRequest<GroupInvite[]>("/chats/invites", {
    method: "GET",
  });
}

export async function respondToGroupInvite(
  inviteId: string,
  status: "accepted" | "declined",
) {
  return apiRequest<Chat | GroupInvite>(`/chats/invites/${inviteId}/respond`, {
    method: "POST",
    body: { status },
  });
}

export async function addChatMembers(chatId: string, memberIds: string[]) {
  return apiRequest<Chat>(`/chats/${chatId}/members`, {
    method: "POST",
    body: { memberIds },
  });
}

export async function updateChatSettings(
  chatId: string,
  input: Partial<Pick<Chat, "title" | "avatarUrl" | "wallpaperUrl">>,
) {
  return apiRequest<Chat>(`/chats/${chatId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function updateChatMemberRole(
  chatId: string,
  userId: string,
  role: "admin" | "member" | "subscriber",
) {
  return apiRequest<Chat>(`/chats/${chatId}/members/role`, {
    method: "PATCH",
    body: { userId, role },
  });
}

export async function getSubscribers(chatId: string) {
  return apiRequest<ChannelSubscriber[]>(`/chats/${chatId}/subscribers`, {
    method: "GET",
  });
}

export const getChannelSubscribers = getSubscribers;

export async function uploadChatAvatar(chatId: string, file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  return apiRequest<Chat>(`/chats/${chatId}/avatar`, {
    method: "POST",
    body: formData,
  });
}

export async function uploadChatWallpaper(chatId: string, file: File) {
  const formData = new FormData();
  formData.append("wallpaper", file);

  return apiRequest<Chat>(`/chats/${chatId}/wallpaper`, {
    method: "POST",
    body: formData,
  });
}
