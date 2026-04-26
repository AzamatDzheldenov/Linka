import { AuthUser, getAccessToken, useAuthStore } from "../../store/auth-store";
import { ru } from "@/lib/i18n/ru";

declare const process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
  };
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3002";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return request<T>(path, options, true);
}

async function request<T>(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const { body, headers, auth = true, ...requestOptions } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const accessToken = auth ? getAccessToken() : null;
  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: requestHeaders,
    body:
      body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });

  const payload = await readResponse(response);

  if (response.status === 401 && auth && allowRefresh && (await refreshAccessToken())) {
    return request<T>(path, options, false);
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, response.statusText), response.status, payload);
  }

  return payload as T;
}

async function refreshAccessToken() {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  const payload = await readResponse(response);

  if (!response.ok || !payload || typeof payload !== "object") {
    useAuthStore.getState().clearAuth();
    return false;
  }

  if (
    "accessToken" in payload &&
    typeof payload.accessToken === "string" &&
    "user" in payload
  ) {
    useAuthStore.getState().setAccessToken(payload.accessToken);
    useAuthStore.getState().setCurrentUser(payload.user as AuthUser);
    return true;
  }

  useAuthStore.getState().clearAuth();
  return false;
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("Content-Type");

  if (response.status === 204) {
    return null;
  }

  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback || ru.app.requestFailed;
}
