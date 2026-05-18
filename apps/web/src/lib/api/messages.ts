import { apiBlobRequest, apiRequest } from "./client";

export type MessageSender = {
  id: string;
  username: string;
  displayName: string | null;
  nameEmoji: string | null;
  avatarUrl: string | null;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  replyToMessageId: string | null;
  forwardedFromMessageId: string | null;
  forwardedFromUserId: string | null;
  forwardedFromChatId: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: MessageSender;
  replyTo: MessagePreview | null;
  forwardedFrom: ForwardedFromPreview | null;
  reactions: MessageReactionGroup[];
  receipts: MessageReceipt[];
};

export type MessagePreview = {
  id: string;
  senderId: string;
  sender: MessageSender;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  deletedAt: string | null;
};

export type ForwardedFromPreview = {
  messageId: string | null;
  userId: string | null;
  chatId: string | null;
  sender: MessageSender;
  label: string;
  chatTitle: string | null;
};

export type MessageReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  usersPreview: MessageSender[];
};

export type MessageReactionUpdate = {
  messageId: string;
  chatId: string;
  reactions: MessageReactionGroup[];
};

export type MessageReceipt = {
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type MessagesPage = {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
};

export async function getMessages(chatId: string, cursor?: string) {
  const params = cursor
    ? `?${new URLSearchParams({ cursor }).toString()}`
    : "";

  return apiRequest<MessagesPage>(`/chats/${chatId}/messages${params}`, {
    method: "GET",
  });
}

export async function getMessageMediaBlob(mediaUrl: string) {
  const fileId = mediaUrl.split("/").filter(Boolean).pop();

  if (!fileId) {
    throw new Error("Invalid media URL");
  }

  return apiBlobRequest(`/messages/media/${encodeURIComponent(fileId)}`, {
    method: "GET",
  });
}

export async function sendMediaMessage(
  chatId: string,
  file: File,
  text?: string,
  replyToMessageId?: string,
) {
  const formData = new FormData();
  formData.append("file", file);

  if (text?.trim()) {
    formData.append("text", text.trim());
  }

  if (replyToMessageId) {
    formData.append("replyToMessageId", replyToMessageId);
  }

  return apiRequest<Message>(`/chats/${chatId}/media`, {
    method: "POST",
    body: formData,
  });
}

export async function forwardMessage(messageId: string, targetChatIds: string[]) {
  return apiRequest<{ messages: Message[] }>(`/messages/${messageId}/forward`, {
    method: "POST",
    body: { targetChatIds },
  });
}

export async function toggleMessageReaction(messageId: string, emoji: string) {
  return apiRequest<MessageReactionUpdate>(`/messages/${messageId}/reactions`, {
    method: "POST",
    body: { emoji },
  });
}

export async function deleteMessageReaction(messageId: string, emoji: string) {
  return apiRequest<MessageReactionUpdate>(
    `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
    },
  );
}

export async function getMessageReactions(messageId: string) {
  return apiRequest<MessageReactionGroup[]>(`/messages/${messageId}/reactions`, {
    method: "GET",
  });
}

export async function deleteMessage(chatId: string, messageId: string) {
  return apiRequest<Message>(`/chats/${chatId}/messages/${messageId}`, {
    method: "DELETE",
  });
}
