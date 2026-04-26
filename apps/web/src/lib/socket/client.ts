import { io, Socket } from "socket.io-client";
import { getAccessToken } from "@/store/auth-store";

declare const process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
  };
};

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

let socket: Socket | null = null;

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
  socket = io(SOCKET_URL, {
    auth: { accessToken },
    transports: ["websocket"],
    withCredentials: true,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
