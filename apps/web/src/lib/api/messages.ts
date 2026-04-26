import { apiRequest } from "./client";

export type MessageSender = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: MessageSender;
};

export async function getMessages(chatId: string) {
  return apiRequest<Message[]>(`/chats/${chatId}/messages`, {
    method: "GET",
  });
}
