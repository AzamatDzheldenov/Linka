import { AuthUser, getAccessToken, useAuthStore } from "../../store/auth-store";
import { t as ru } from "@/lib/i18n";

declare const process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
  };
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3002";

let refreshPromise: Promise<boolean> | null = null;
let authSessionVersion = 0;
let clearedAuthSessionVersion: number | null = null;

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

export async function apiBlobRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Blob> {
  return blobRequest(path, options, true);
}

export function markAuthSessionChanged() {
  authSessionVersion += 1;
  clearedAuthSessionVersion = null;
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

  if (response.status === 401 && auth) {
    if (allowRefresh && (await refreshAccessToken())) {
      return request<T>(path, options, false);
    }

    clearAuthOnceForSession(authSessionVersion);
  }

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, response.statusText), response.status, payload);
  }

  return payload as T;
}

async function refreshAccessToken() {
  // Mutex: all parallel 401 handlers share this single refresh request.
  // The backend rotates refresh tokens, so starting a second refresh with the
  // old cookie would invalidate the user even though the first refresh worked.
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = performRefreshAccessToken();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function performRefreshAccessToken() {
  const requestSessionVersion = authSessionVersion;
  let response: Response;
  let payload: unknown;

  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    payload = await readResponse(response);
  } catch {
    clearAuthOnceForSession(requestSessionVersion);
    return false;
  }

  // Logout/login bumps the session version. A refresh that started before that
  // must not write a new access token back into the store.
  if (requestSessionVersion !== authSessionVersion) {
    return false;
  }

  if (!response.ok || !payload || typeof payload !== "object") {
    clearAuthOnceForSession(requestSessionVersion);
    return false;
  }

  if (
    "accessToken" in payload &&
    typeof payload.accessToken === "string" &&
    "user" in payload
  ) {
    if (requestSessionVersion !== authSessionVersion) {
      return false;
    }

    useAuthStore.getState().setAccessToken(payload.accessToken);
    useAuthStore.getState().setCurrentUser(payload.user as AuthUser);
    return true;
  }

  clearAuthOnceForSession(requestSessionVersion);
  return false;
}

function clearAuthOnceForSession(sessionVersion: number) {
  if (sessionVersion !== authSessionVersion) {
    return;
  }

  if (clearedAuthSessionVersion === sessionVersion) {
    return;
  }

  const authState = useAuthStore.getState();
  if (!authState.accessToken && !authState.currentUser) {
    return;
  }

  clearedAuthSessionVersion = sessionVersion;
  authSessionVersion += 1;
  authState.clearAuth();
}

async function blobRequest(
  path: string,
  options: ApiRequestOptions,
  allowRefresh: boolean,
): Promise<Blob> {
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

  if (response.status === 401 && auth) {
    if (allowRefresh && (await refreshAccessToken())) {
      return blobRequest(path, options, false);
    }

    clearAuthOnceForSession(authSessionVersion);
  }

  if (!response.ok) {
    const payload = await readResponse(response);
    throw new ApiError(getErrorMessage(payload, response.statusText), response.status, payload);
  }

  return response.blob();
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
