import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "@/lib/api/client";
import { getAccessToken } from "@/store/auth-store";

let socket: Socket | null = null;
const typingChatIds = new Set<string>();

export function getSocket() {
  const accessToken = getAccessToken();

  if (!accessToken) {
    disconnectSocket();
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  socket?.disconnect();
  socket = io(API_BASE_URL, {
    auth: { accessToken },
    transports: ["websocket"],
    withCredentials: true,
  });

  return socket;
}

export function emitTypingStart(chatId: string) {
  const activeSocket = getSocket();

  if (!activeSocket) {
    return;
  }

  typingChatIds.add(chatId);
  activeSocket.emit("typing:start", { chatId });
}

export function emitTypingStop(chatId: string) {
  const activeSocket = getSocket();

  typingChatIds.delete(chatId);
  activeSocket?.emit("typing:stop", { chatId });
}

export function emitTypingStopAll() {
  if (!socket) {
    typingChatIds.clear();
    return;
  }

  typingChatIds.forEach((chatId) => {
    socket?.emit("typing:stop", { chatId });
  });
  typingChatIds.clear();
}

export function disconnectSocket() {
  emitTypingStopAll();
  socket?.disconnect();
  socket = null;
}
