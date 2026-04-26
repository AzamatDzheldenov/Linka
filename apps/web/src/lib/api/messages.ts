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
  receipts: MessageReceipt[];
};

export type MessageReceipt = {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export async function getMessages(chatId: string) {
  return apiRequest<Message[]>(`/chats/${chatId}/messages`, {
    method: "GET",
  });
}

export async function sendMediaMessage(chatId: string, file: File, text?: string) {
  const formData = new FormData();
  formData.append("file", file);

  if (text?.trim()) {
    formData.append("text", text.trim());
  }

  return apiRequest<Message>(`/chats/${chatId}/media`, {
    method: "POST",
    body: formData,
  });
}
