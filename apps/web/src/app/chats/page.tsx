"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chat, createPrivateChat, getChats } from "@/lib/api/chats";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { getMessages, Message, sendMediaMessage } from "@/lib/api/messages";
import { logout } from "@/lib/api/auth";
import {
  emitTypingStart,
  emitTypingStop,
  getSocket,
} from "@/lib/socket/client";
import { ru } from "@/lib/i18n/ru";
import { searchUsers, uploadAvatar } from "@/lib/api/users";
import { AuthUser, useAuthStore } from "@/store/auth-store";

const SIDEBAR_WIDTH_STORAGE_KEY = "linka.sidebar.width";
const MIN_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 420;
const COMPACT_SIDEBAR_WIDTH = 96;
const TYPING_STOP_DELAY_MS = 1400;

type TypingUser = {
  chatId: string;
  userId: string;
  username: string;
  displayName: string | null;
};

type ReceiptUpdate = {
  chatId: string;
  userId: string;
  messageIds: string[];
  deliveredAt?: string;
  readAt?: string;
};

export default function ChatsPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthUser[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const activeTypingChatIdRef = useRef<string | null>(null);
  const isCompactSidebar = !isMobile && sidebarWidth <= COMPACT_SIDEBAR_WIDTH;

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    function handleViewportChange() {
      setIsMobile(mediaQuery.matches);
    }

    handleViewportChange();
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => {
      mediaQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsedWidth = storedWidth ? Number(storedWidth) : NaN;

    if (Number.isFinite(parsedWidth)) {
      setSidebarWidth(clampSidebarWidth(parsedWidth));
    }
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const nextWidth = clampSidebarWidth(event.clientX - sidebarLeft);
      sidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    }

    function handlePointerUp() {
      setIsResizingSidebar(false);
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(sidebarWidthRef.current),
      );
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!isResizingSidebar && isMobile === false) {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(sidebarWidth),
      );
    }
  }, [isMobile, isResizingSidebar, sidebarWidth]);

  useEffect(() => {
    let isActive = true;

    async function loadChats() {
      if (isMobile === null) {
        return;
      }

      setIsLoadingChats(true);

      try {
        const nextChats = await getChats();

        if (isActive) {
          setChats(nextChats);
          setSelectedChat((current) =>
            current
              ? nextChats.find((chat) => chat.id === current.id) ?? current
              : isMobile
                ? null
                : nextChats[0] ?? null,
          );
        }
      } catch {
        if (isActive) {
          setError(ru.chats.errors.loadChats);
        }
      } finally {
        if (isActive) {
          setIsLoadingChats(false);
        }
      }
    }

    void loadChats();

    return () => {
      isActive = false;
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile === false && !selectedChat && chats.length) {
      setSelectedChat(chats[0]);
    }
  }, [chats, isMobile, selectedChat]);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    setIsSearching(true);
    setError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const users = await searchUsers(normalizedQuery);

        if (isActive) {
          setResults(users);
        }
      } catch {
        if (isActive) {
          setResults([]);
          setError(ru.chats.errors.searchUsers);
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setTypingUsers([]);
      return;
    }

    let isActive = true;
    const socket = getSocket();

    async function loadMessages(chatId: string) {
      setIsLoadingMessages(true);
      setMessageError(null);

      try {
        const history = await getMessages(chatId);

        if (isActive) {
          setMessages(history);
          socket?.emit("markAsRead", { chatId });
        }
      } catch {
        if (isActive) {
          setMessages([]);
          setMessageError(ru.chats.errors.loadMessages);
        }
      } finally {
        if (isActive) {
          setIsLoadingMessages(false);
        }
      }
    }

    function handleNewMessage(message: Message) {
      if (message.chatId !== selectedChat?.id) {
        return;
      }

      setMessages((currentMessages) => {
        if (currentMessages.some((item) => item.id === message.id)) {
          return currentMessages;
        }

        return [...currentMessages, message];
      });

      if (message.senderId !== currentUser?.id) {
        socket?.emit("markAsRead", { chatId: selectedChat.id });
      }
    }

    function handleMessageDelivered(payload: ReceiptUpdate) {
      updateMessageReceipts(payload, "delivered");
    }

    function handleMessageRead(payload: ReceiptUpdate) {
      updateMessageReceipts(payload, "read");
    }

    function handleTypingStart(payload: TypingUser) {
      if (payload.chatId !== selectedChat?.id) {
        return;
      }

      setTypingUsers((currentUsers) => {
        if (currentUsers.some((user) => user.userId === payload.userId)) {
          return currentUsers;
        }

        return [...currentUsers, payload];
      });
    }

    function handleTypingStop(payload: TypingUser) {
      if (payload.chatId !== selectedChat?.id) {
        return;
      }

      setTypingUsers((currentUsers) =>
        currentUsers.filter((user) => user.userId !== payload.userId),
      );
    }

    void loadMessages(selectedChat.id);
    setTypingUsers([]);
    socket?.emit("joinChat", { chatId: selectedChat.id });
    socket?.on("newMessage", handleNewMessage);
    socket?.on("message:delivered", handleMessageDelivered);
    socket?.on("message:read", handleMessageRead);
    socket?.on("userTyping:start", handleTypingStart);
    socket?.on("userTyping:stop", handleTypingStop);
    socket?.on("connect_error", () => {
      setMessageError(ru.chats.errors.realtimeConnection);
    });

    return () => {
      isActive = false;
      stopTyping(selectedChat.id);
      socket?.emit("leaveChat", { chatId: selectedChat.id });
      socket?.off("newMessage", handleNewMessage);
      socket?.off("message:delivered", handleMessageDelivered);
      socket?.off("message:read", handleMessageRead);
      socket?.off("userTyping:start", handleTypingStart);
      socket?.off("userTyping:stop", handleTypingStop);
      socket?.off("connect_error");
    };
  }, [currentUser?.id, selectedChat]);

  function updateMessageReceipts(
    payload: ReceiptUpdate,
    status: "delivered" | "read",
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (
          message.chatId !== payload.chatId ||
          !payload.messageIds.includes(message.id)
        ) {
          return message;
        }

        const receipts = message.receipts.map((receipt) => {
          if (receipt.userId !== payload.userId) {
            return receipt;
          }

          return {
            ...receipt,
            deliveredAt:
              receipt.deliveredAt ?? payload.deliveredAt ?? payload.readAt ?? null,
            readAt:
              status === "read"
                ? receipt.readAt ?? payload.readAt ?? null
                : receipt.readAt,
          };
        });

        return { ...message, receipts };
      }),
    );
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedChat?.id]);

  async function handleUserClick(user: AuthUser) {
    setPendingUserId(user.id);
    setError(null);

    try {
      const chat = await createPrivateChat(user.id);
      setSelectedChat(chat);
      setQuery("");
      setResults([]);
      setChats((currentChats) => {
        const withoutChat = currentChats.filter((item) => item.id !== chat.id);
        return [chat, ...withoutChat];
      });
    } catch {
      setError(ru.chats.errors.createChat);
    } finally {
      setPendingUserId(null);
    }
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();

    if (!selectedChat || !text) {
      return;
    }

    const socket = getSocket();
    if (!socket) {
      setMessageError(ru.chats.errors.realtimeNotReady);
      return;
    }

    setIsSending(true);
    setMessageError(null);
    stopTyping(selectedChat.id);

    socket.emit(
      "sendMessage",
      { chatId: selectedChat.id, text },
      (response: Message | { error?: string }) => {
        setIsSending(false);

        if (response && "error" in response && response.error) {
          setMessageError(ru.chats.errors.sendMessage);
          return;
        }

        setMessageText("");
      },
    );
  }

  async function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!selectedChat || !file) {
      return;
    }

    const caption = messageText.trim();
    setIsUploadingMedia(true);
    setMessageError(null);

    try {
      await sendMediaMessage(selectedChat.id, file, caption || undefined);
      stopTyping(selectedChat.id);
      setMessageText("");
    } catch (error) {
      setMessageError(
        error instanceof ApiError
          ? error.message
          : ru.chats.errors.uploadMedia,
      );
    } finally {
      setIsUploadingMedia(false);
    }
  }

  function handleBackToChats() {
    if (selectedChat) {
      stopTyping(selectedChat.id);
    }

    setSelectedChat(null);
    setMessageError(null);
  }

  function handleMessageTextChange(value: string) {
    setMessageText(value);

    if (!selectedChat) {
      return;
    }

    emitTypingStart(selectedChat.id);
    activeTypingChatIdRef.current = selectedChat.id;

    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
    }

    typingStopTimeoutRef.current = window.setTimeout(() => {
      stopTyping(selectedChat.id);
    }, TYPING_STOP_DELAY_MS);
  }

  function stopTyping(chatId: string) {
    if (typingStopTimeoutRef.current) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    if (activeTypingChatIdRef.current === chatId) {
      activeTypingChatIdRef.current = null;
    }

    emitTypingStop(chatId);
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);

    try {
      await uploadAvatar(file);
    } catch (error) {
      setAvatarError(
        error instanceof ApiError
          ? error.message
          : ru.chats.errors.uploadAvatar,
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  function handleSidebarResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (isMobile !== false) {
      return;
    }

    event.preventDefault();
    setIsResizingSidebar(true);
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    setError(null);

    try {
      await logout();
      router.replace("/login");
    } catch {
      setError(ru.auth.errors.logoutFailed);
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="flex h-dvh min-h-dvh w-full overflow-hidden bg-[#0e1621] text-[#f5f8fb]">
      <aside
        ref={sidebarRef}
        className={`relative min-h-0 w-full flex-col border-r border-white/5 bg-[#17212b] md:flex md:shrink-0 ${
          selectedChat ? "hidden" : "flex"
        }`}
        style={
          isMobile === false
            ? {
                width: sidebarWidth,
                minWidth: sidebarWidth,
                maxWidth: sidebarWidth,
              }
            : undefined
        }
      >
        <header
          className={`border-b border-white/5 py-4 ${
            isCompactSidebar ? "px-3" : "px-4"
          }`}
        >
          <div
            className={`flex items-center ${
              isCompactSidebar ? "justify-center" : "gap-3"
            }`}
          >
            <label
              className={`group relative block shrink-0 rounded-full outline-none ${
                isUploadingAvatar
                  ? "cursor-wait opacity-70"
                  : "cursor-pointer focus-within:ring-2 focus-within:ring-[#2aabee]/40"
            }`}
              title={ru.chats.uploadAvatar}
            >
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={isUploadingAvatar}
                onChange={handleAvatarChange}
                type="file"
              />
              <Avatar
                avatarUrl={currentUser?.avatarUrl ?? null}
                label={getUserLabel(currentUser)}
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                {isUploadingAvatar ? "..." : ru.chats.editAvatar}
              </span>
            </label>
            <div className={`min-w-0 ${isCompactSidebar ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-semibold text-white">
                {currentUser?.displayName || currentUser?.username || "Linka"}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                @{currentUser?.username ?? ru.chats.loadingProfile}
              </p>
            </div>
          </div>
          {avatarError && !isCompactSidebar ? (
            <p className="mt-3 text-sm text-red-200">{avatarError}</p>
          ) : null}
          {!isCompactSidebar ? (
            <button
              className="mt-3 h-9 rounded-md px-3 text-sm font-medium text-[#8fa3b5] transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
            >
              {isLoggingOut ? ru.auth.loggingOut : ru.auth.logout}
            </button>
          ) : null}
        </header>

        {isCompactSidebar ? null : (
          <div className="border-b border-white/5 px-4 py-3">
            <label className="block">
              <span className="sr-only">{ru.chats.searchUsers}</span>
              <input
                className="h-11 w-full rounded-md border border-white/5 bg-[#242f3d] px-4 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={ru.chats.searchUsers}
                autoComplete="off"
              />
            </label>
          </div>
        )}

        <section className="min-h-0 flex-1 overflow-y-auto">
          {!isCompactSidebar && query.trim() ? (
            <SearchResults
              compact={isCompactSidebar}
              error={error}
              isSearching={isSearching}
              onUserClick={handleUserClick}
              pendingUserId={pendingUserId}
              results={results}
            />
          ) : (
            <ChatList
              chats={chats}
              compact={isCompactSidebar}
              isLoading={isLoadingChats}
              onSelectChat={setSelectedChat}
              selectedChatId={selectedChat?.id ?? null}
            />
          )}
        </section>

        <button
          aria-label={ru.chats.resizeSidebar}
          className={`absolute -right-[5px] top-0 z-10 hidden h-full w-[10px] cursor-col-resize items-center justify-center md:flex ${
            isResizingSidebar ? "bg-[#2aabee]/10" : "bg-transparent"
          }`}
          onPointerDown={handleSidebarResizeStart}
          type="button"
        >
          <span className="h-12 w-[2px] rounded-full bg-white/10 transition" />
        </button>
      </aside>

      <ChatArea
        currentUserId={currentUser?.id ?? null}
        isLoadingMessages={isLoadingMessages}
        isSending={isSending}
        isUploadingMedia={isUploadingMedia}
        messageError={messageError}
        messageText={messageText}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onBackToChats={handleBackToChats}
        onMediaChange={handleMediaChange}
        onMessageTextChange={handleMessageTextChange}
        onSendMessage={handleSendMessage}
        selectedChat={selectedChat}
        typingUsers={typingUsers}
      />
    </main>
  );
}

function ChatList({
  chats,
  compact,
  isLoading,
  onSelectChat,
  selectedChatId,
}: {
  chats: Chat[];
  compact: boolean;
  isLoading: boolean;
  onSelectChat: (chat: Chat) => void;
  selectedChatId: string | null;
}) {
  if (isLoading) {
    return <StateMessage>{ru.chats.loadingChats}</StateMessage>;
  }

  if (!chats.length) {
    return <StateMessage>{ru.chats.noChats}</StateMessage>;
  }

  return (
    <ul className="divide-y divide-white/5">
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            className={`flex w-full items-center px-4 py-3 text-left transition ${
              selectedChatId === chat.id
                ? "bg-[#2aabee]/15"
                : "hover:bg-white/[0.03]"
            } ${compact ? "justify-center px-3" : "gap-3"}`}
            onClick={() => onSelectChat(chat)}
            type="button"
            title={chat.partner?.username ? `@${chat.partner.username}` : ru.chats.privateChat}
          >
            <Avatar
              avatarUrl={chat.partner?.avatarUrl ?? null}
              label={chat.partner?.displayName || chat.partner?.username || ru.chats.privateChat}
            />
            <div className={`min-w-0 ${compact ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-medium text-white">
                {chat.partner?.displayName || chat.partner?.username || ru.chats.privateChat}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                {chat.partner ? `@${chat.partner.username}` : ru.chats.noParticipant}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchResults({
  compact,
  error,
  isSearching,
  onUserClick,
  pendingUserId,
  results,
}: {
  compact: boolean;
  error: string | null;
  isSearching: boolean;
  onUserClick: (user: AuthUser) => void;
  pendingUserId: string | null;
  results: AuthUser[];
}) {
  if (isSearching) {
    return <StateMessage>{ru.chats.searching}</StateMessage>;
  }

  if (error) {
    return <StateMessage tone="error">{error}</StateMessage>;
  }

  if (!results.length) {
    return <StateMessage>{ru.chats.noUsersFound}</StateMessage>;
  }

  return (
    <ul className="divide-y divide-white/5">
      {results.map((user) => (
        <li key={user.id}>
          <button
            className={`flex w-full items-center px-4 py-3 text-left transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60 ${
              compact ? "justify-center px-3" : "gap-3"
            }`}
            disabled={pendingUserId === user.id}
            onClick={() => onUserClick(user)}
            type="button"
            title={`@${user.username}`}
          >
            <Avatar
              avatarUrl={user.avatarUrl}
              label={user.displayName || user.username}
            />
            <div className={`min-w-0 ${compact ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-medium text-white">
                {user.displayName || user.username}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                {pendingUserId === user.id ? ru.chats.openingChat : `@${user.username}`}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChatArea({
  currentUserId,
  isLoadingMessages,
  isSending,
  isUploadingMedia,
  messageError,
  messageText,
  messages,
  messagesEndRef,
  onBackToChats,
  onMediaChange,
  onMessageTextChange,
  onSendMessage,
  selectedChat,
  typingUsers,
}: {
  currentUserId: string | null;
  isLoadingMessages: boolean;
  isSending: boolean;
  isUploadingMedia: boolean;
  messageError: string | null;
  messageText: string;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onBackToChats: () => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMessageTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  selectedChat: Chat | null;
  typingUsers: TypingUser[];
}) {
  const typingText = getTypingText(typingUsers);

  return (
    <section
      className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0e1621] md:flex ${
        selectedChat ? "flex" : "hidden"
      }`}
    >
      {selectedChat?.partner ? (
        <>
          <header className="flex h-[64px] shrink-0 items-center gap-3 border-b border-white/5 bg-[#17212b] px-3 md:h-[73px] md:px-5">
            <button
              aria-label={ru.chats.backToChats}
              className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-[15px] font-medium text-[#2aabee] transition hover:bg-white/[0.04] md:hidden"
              onClick={onBackToChats}
              type="button"
            >
              <span aria-hidden="true">{"<"}</span>
              <span>{ru.chats.back}</span>
            </button>
            <Avatar
              avatarUrl={selectedChat.partner.avatarUrl}
              label={selectedChat.partner.displayName || selectedChat.partner.username}
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-white">
                {selectedChat.partner.displayName || selectedChat.partner.username}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                {typingText ?? `@${selectedChat.partner.username}`}
              </p>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-5 md:py-5">
            {isLoadingMessages ? (
              <StateMessage>{ru.chats.loadingMessages}</StateMessage>
            ) : messages.length ? (
              <div className="space-y-2">
                {messages.map((message) => (
                  <MessageBubble
                    isOwn={message.senderId === currentUserId}
                    key={message.id}
                    message={message}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <h1 className="text-2xl font-semibold text-white">
                    {ru.chats.chatWith(selectedChat.partner.username)}
                  </h1>
                  <p className="mt-2 max-w-sm text-sm text-[#8fa3b5]">
                    {ru.chats.firstMessageHint}
                  </p>
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-white/5 bg-[#17212b] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4"
            onSubmit={onSendMessage}
          >
            {messageError ? (
              <p className="mb-2 text-sm text-red-200">{messageError}</p>
            ) : null}
            {isUploadingMedia ? (
              <p className="mb-2 text-sm text-[#8fa3b5]">{ru.chats.uploading}</p>
            ) : null}
            <div className="flex min-w-0 items-end gap-2 md:gap-3">
              <label
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/5 bg-[#242f3d] text-xl font-semibold text-[#2aabee] transition hover:bg-white/[0.04] ${
                  isUploadingMedia ? "cursor-wait opacity-60" : "cursor-pointer"
                }`}
                title={ru.chats.attachFile}
              >
                <input
                  accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/webm,application/pdf"
                  className="sr-only"
                  disabled={isUploadingMedia}
                  onChange={onMediaChange}
                  type="file"
                />
                <span aria-hidden="true">+</span>
              </label>
              <textarea
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-white/5 bg-[#242f3d] px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
                onChange={(event) => onMessageTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={ru.chats.messagePlaceholder}
                value={messageText}
              />
              <button
                className="h-11 shrink-0 rounded-md bg-[#2aabee] px-4 text-[15px] font-semibold text-white transition hover:bg-[#239bd8] disabled:cursor-not-allowed disabled:opacity-60 md:px-5"
                disabled={isSending || isUploadingMedia || !messageText.trim()}
                type="submit"
              >
                {isSending ? ru.chats.sending : ru.chats.send}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#17212b] text-2xl font-semibold text-[#2aabee]">
              L
            </div>
            <h1 className="text-2xl font-semibold text-white">
              {ru.chats.chooseChat}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-[#8fa3b5]">
              {ru.chats.chooseChatHint}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function MessageBubble({
  isOwn,
  message,
}: {
  isOwn: boolean;
  message: Message;
}) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[15px] shadow-sm md:max-w-[70%] ${
          isOwn ? "bg-[#2aabee] text-white" : "bg-[#17212b] text-[#f5f8fb]"
        }`}
      >
        <MessageMedia message={message} />
        {message.text ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : null}
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            isOwn ? "text-white/75" : "text-[#8fa3b5]"
          }`}
        >
          <span>{formatMessageTime(message.createdAt)}</span>
          {isOwn ? <MessageStatus status={getMessageStatus(message)} /> : null}
        </p>
      </div>
    </div>
  );
}

function MessageStatus({ status }: { status: "sent" | "delivered" | "read" }) {
  const isRead = status === "read";
  const isDelivered = status === "delivered" || isRead;
  const label = getMessageStatusLabel(status);

  return (
    <span
      aria-label={label}
      className={`inline-flex w-5 justify-end font-semibold ${
        isRead ? "text-[#7dd3fc]" : "text-white/70"
      }`}
      title={label}
    >
      {isDelivered ? "\u2713\u2713" : "\u2713"}
    </span>
  );
}

function MessageMedia({ message }: { message: Message }) {
  if (!message.mediaUrl || !message.mediaType) {
    return null;
  }

  const url = resolveUploadUrl(message.mediaUrl);

  if (message.mediaType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="mb-2 max-h-[320px] w-full max-w-[320px] rounded-md object-cover"
        src={url}
      />
    );
  }

  if (message.mediaType === "video") {
    return (
      <video
        className="mb-2 max-h-[320px] w-full max-w-[360px] rounded-md bg-black"
        controls
        src={url}
      />
    );
  }

  if (message.mediaType === "audio") {
    return <audio className="mb-2 w-[260px] max-w-full" controls src={url} />;
  }

  return (
    <a
      className="mb-2 flex max-w-[280px] items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-white transition hover:bg-black/20"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#2aabee]/20 text-xs font-semibold text-white">
        PDF
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {getUploadFilename(message.mediaUrl)}
        </span>
        <span className="block text-xs text-white/70">{ru.chats.openDocument}</span>
      </span>
    </a>
  );
}

function Avatar({
  avatarUrl,
  label,
}: {
  avatarUrl: string | null;
  label: string;
}) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#242f3d] text-sm font-semibold text-[#2aabee]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-full w-full object-cover"
          src={resolveUploadUrl(avatarUrl)}
        />
      ) : (
        label.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function StateMessage({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "px-4 py-8 text-center text-sm text-red-200"
          : "px-4 py-8 text-center text-sm text-[#8fa3b5]"
      }
    >
      {children}
    </div>
  );
}

function getUserLabel(user: AuthUser | null) {
  return user?.displayName || user?.username || "Linka";
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getMessageStatus(message: Message) {
  if (!message.receipts?.length) {
    return "sent";
  }

  if (message.receipts.every((receipt) => receipt.readAt)) {
    return "read";
  }

  if (
    message.receipts.some((receipt) => receipt.deliveredAt || receipt.readAt)
  ) {
    return "delivered";
  }

  return "sent";
}

function getMessageStatusLabel(status: "sent" | "delivered" | "read") {
  if (status === "read") {
    return ru.chats.statusRead;
  }

  if (status === "delivered") {
    return ru.chats.statusDelivered;
  }

  return ru.chats.statusSent;
}

function resolveUploadUrl(url: string) {
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
}

function getUploadFilename(url: string) {
  return url.split("/").filter(Boolean).at(-1) ?? "document.pdf";
}

function getTypingText(users: TypingUser[]) {
  if (users.length === 0) {
    return null;
  }

  if (users.length === 1) {
    return ru.chats.typing;
  }

  return ru.chats.severalTyping;
}

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );
}
