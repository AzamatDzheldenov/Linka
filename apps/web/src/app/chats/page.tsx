"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
  X,
} from "lucide-react";
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
import {
  UserSettings,
  getUserSettings,
  searchUsers,
  uploadAvatar,
} from "@/lib/api/users";
import { AuthUser, useAuthStore } from "@/store/auth-store";
import { ThemeMode, useTheme } from "@/providers/theme-provider";

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
  nameEmoji: string | null;
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
  const { cycleTheme, theme } = useTheme();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthUser[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
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
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const activeTypingChatIdRef = useRef<string | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const isWindowFocusedRef = useRef(true);
  const canPlayAudioRef = useRef(false);
  const messageAudioRef = useRef<HTMLAudioElement | null>(null);
  const isCompactSidebar = !isMobile && sidebarWidth <= COMPACT_SIDEBAR_WIDTH;

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id ?? null;
  }, [selectedChat?.id]);

  useEffect(() => {
    messageAudioRef.current = new Audio("/sounds/message.mp3");
    messageAudioRef.current.preload = "auto";

    function unlockAudio() {
      canPlayAudioRef.current = true;
    }

    function handleFocus() {
      isWindowFocusedRef.current = true;
    }

    function handleBlur() {
      isWindowFocusedRef.current = false;
    }

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

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
    if (!isUserMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    let isActive = true;

    async function loadUserSettings() {
      try {
        const settings = await getUserSettings();

        if (isActive) {
          setUserSettings(settings);
        }
      } catch {
        if (isActive) {
          setUserSettings(null);
        }
      }
    }

    void loadUserSettings();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    if (!socket) {
      return;
    }

    const activeSocket = socket;

    function handleChatNewMessage(message: Message) {
      const isOwnMessage = message.senderId === currentUser?.id;
      const isActiveChat = selectedChatIdRef.current === message.chatId;

      setChats((currentChats) =>
        sortChatsByLastMessage(
          currentChats.map((chat) => {
            if (chat.id !== message.chatId) {
              return chat;
            }

            return {
              ...chat,
              lastMessage: message,
              lastMessageAt: message.createdAt,
              updatedAt: message.createdAt,
              unreadCount:
                isOwnMessage || isActiveChat
                  ? 0
                  : Math.min((chat.unreadCount ?? 0) + 1, 999),
            };
          }),
        ),
      );

      if (!isOwnMessage && isActiveChat && userSettings?.showReadReceipts !== false) {
        activeSocket.emit("markAsRead", { chatId: message.chatId });
      }

      if (
        !isOwnMessage &&
        userSettings?.soundEnabled !== false &&
        (!isActiveChat || !isWindowFocusedRef.current)
      ) {
        void playMessageSound();
      }
    }

    activeSocket.on("chat:newMessage", handleChatNewMessage);

    return () => {
      activeSocket.off("chat:newMessage", handleChatNewMessage);
    };
  }, [currentUser?.id, userSettings?.showReadReceipts, userSettings?.soundEnabled]);

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
          setChats(sortChatsByLastMessage(nextChats));
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
          if (userSettings?.showReadReceipts !== false) {
            socket?.emit("markAsRead", { chatId });
          }
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
        if (userSettings?.showReadReceipts !== false) {
          socket?.emit("markAsRead", { chatId: selectedChat.id });
        }
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
  }, [currentUser?.id, selectedChat, userSettings?.showReadReceipts]);

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
      setIsMobileDrawerOpen(false);
      setQuery("");
      setResults([]);
      setChats((currentChats) => {
        const withoutChat = currentChats.filter((item) => item.id !== chat.id);
        return sortChatsByLastMessage([chat, ...withoutChat]);
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
    setIsMobileDrawerOpen(true);
  }

  function handleSelectChat(chat: Chat) {
    setSelectedChat(chat);
    setIsMobileDrawerOpen(false);
    setChats((currentChats) =>
      currentChats.map((item) =>
        item.id === chat.id ? { ...item, unreadCount: 0 } : item,
      ),
    );
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
    setIsUserMenuOpen(false);
    setIsMobileDrawerOpen(false);

    try {
      await logout();
      router.replace("/login");
    } catch {
      setError(ru.auth.errors.logoutFailed);
      setIsLoggingOut(false);
    }
  }

  function handleProfileClick() {
    setIsUserMenuOpen(false);
    setIsMobileDrawerOpen(false);
    router.push("/profile");
  }

  function handleSettingsClick() {
    setIsUserMenuOpen(false);
    setIsMobileDrawerOpen(false);
    router.push("/settings");
  }

  function handleThemeClick() {
    cycleTheme();
    setIsUserMenuOpen(false);
  }

  function handleOpenProfile(username: string) {
    router.push(`/profile/${encodeURIComponent(username)}`);
  }

  async function playMessageSound() {
    if (!canPlayAudioRef.current) {
      return;
    }

    const audio = messageAudioRef.current;

    if (audio) {
      try {
        audio.currentTime = 0;
        await audio.play();
        return;
      } catch {
        playFallbackTone();
        return;
      }
    }

    playFallbackTone();
  }

  return (
    <main className="flex h-dvh min-h-dvh w-full overflow-hidden bg-[var(--app-bg)] text-[var(--text-main)]">
      <AnimatePresence>
        {isMobile && isMobileDrawerOpen ? (
          <motion.button
            aria-label="Закрыть меню"
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] md:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setIsMobileDrawerOpen(false)}
            transition={{ duration: 0.18, ease: "easeOut" }}
            type="button"
          />
        ) : null}
      </AnimatePresence>
      <motion.aside
        ref={sidebarRef}
        animate={{
          x: isMobile && selectedChat && !isMobileDrawerOpen ? "-100%" : "0%",
        }}
        className="fixed inset-y-0 left-0 z-50 flex min-h-0 w-full flex-col border-r border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-2xl shadow-black/25 md:relative md:z-auto md:flex md:shrink-0 md:shadow-none"
        initial={false}
        style={
          isMobile === false
            ? {
                width: sidebarWidth,
                minWidth: sidebarWidth,
                maxWidth: sidebarWidth,
              }
            : isMobile === true
              ? {
                  width: selectedChat ? "min(86vw, 340px)" : "100vw",
                  minWidth: selectedChat ? "min(86vw, 340px)" : "100vw",
                  maxWidth: selectedChat ? "min(86vw, 340px)" : "100vw",
                }
              : undefined
        }
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <header
          className={`border-b border-[var(--border-soft)] py-4 ${
            isCompactSidebar ? "px-3" : "px-4"
          }`}
        >
          <div
            className={`flex items-center ${
              isCompactSidebar ? "justify-center" : "gap-3"
            }`}
          >
            <input
              ref={profileFileInputRef}
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isUploadingAvatar}
              onChange={handleAvatarChange}
              type="file"
            />
            <div ref={userMenuRef} className="relative shrink-0">
              <button
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                className="block rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-wait disabled:opacity-70"
                disabled={isUploadingAvatar}
                onClick={() => setIsUserMenuOpen((isOpen) => !isOpen)}
                title="Открыть меню"
                type="button"
              >
                <Avatar
                  avatarUrl={currentUser?.avatarUrl ?? null}
                  label={getUserLabel(currentUser)}
                />
              </button>
              <AnimatePresence>
                {isUserMenuOpen ? (
                  <UserMenu
                    isLoggingOut={isLoggingOut}
                  onLogout={handleLogout}
                  onProfile={handleProfileClick}
                  onSettings={handleSettingsClick}
                  onTheme={handleThemeClick}
                    theme={theme}
                  />
                ) : null}
              </AnimatePresence>
            </div>
            <div className={`min-w-0 ${isCompactSidebar ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">
                {currentUser ? getUserDisplayName(currentUser) : "Linka"}
              </p>
              <p className="truncate text-sm text-[var(--text-muted)]">
                @{currentUser?.username ?? ru.chats.loadingProfile}
              </p>
            </div>
            {isMobile ? (
              <button
                aria-label="Закрыть меню"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] md:hidden"
                onClick={() => setIsMobileDrawerOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            ) : null}
          </div>
          {avatarError && !isCompactSidebar ? (
            <p className="mt-3 text-sm text-[var(--danger)]">{avatarError}</p>
          ) : null}
        </header>

        {isCompactSidebar ? null : (
          <div className="border-b border-[var(--border-soft)] px-4 py-3">
            <label className="block">
              <span className="sr-only">{ru.chats.searchUsers}</span>
              <input
                className="h-11 w-full rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
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
              messagePreviewEnabled={userSettings?.messagePreviewEnabled !== false}
              onSelectChat={handleSelectChat}
              selectedChatId={selectedChat?.id ?? null}
            />
          )}
        </section>

        <button
          aria-label={ru.chats.resizeSidebar}
          className={`absolute -right-[5px] top-0 z-10 hidden h-full w-[10px] cursor-col-resize items-center justify-center md:flex ${
            isResizingSidebar ? "bg-[var(--accent)]/10" : "bg-transparent"
          }`}
          onPointerDown={handleSidebarResizeStart}
          type="button"
        >
          <span className="h-12 w-[2px] rounded-full bg-[var(--border-soft)] transition" />
        </button>
      </motion.aside>

      <ChatArea
        currentUserId={currentUser?.id ?? null}
        isLoadingMessages={isLoadingMessages}
        isSending={isSending}
        isUploadingMedia={isUploadingMedia}
        messageError={messageError}
        messageText={messageText}
        messages={messages}
        messagesEndRef={messagesEndRef}
        isMobile={isMobile === true}
        onBackToChats={handleBackToChats}
        onMediaChange={handleMediaChange}
        onOpenMenu={() => setIsMobileDrawerOpen(true)}
        onOpenProfile={handleOpenProfile}
        onMessageTextChange={handleMessageTextChange}
        onSendMessage={handleSendMessage}
        selectedChat={selectedChat}
        typingUsers={typingUsers}
      />
    </main>
  );
}

function UserMenu({
  isLoggingOut,
  onLogout,
  onProfile,
  onSettings,
  onTheme,
  theme,
}: {
  isLoggingOut: boolean;
  onLogout: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onTheme: () => void;
  theme: ThemeMode;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-56 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--panel-elevated)] py-1 shadow-2xl shadow-black/25"
      exit={{ opacity: 0, scale: 0.98, y: -6 }}
      initial={{ opacity: 0, scale: 0.98, y: -6 }}
      role="menu"
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <MenuButton icon={<User size={18} />} onClick={onProfile}>
        Профиль
      </MenuButton>
      <MenuButton icon={<Settings size={18} />} onClick={onSettings}>
        Настройки
      </MenuButton>
      <MenuButton icon={getThemeIcon(theme)} onClick={onTheme}>
        Сменить тему
        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {getThemeLabel(theme)}
        </span>
      </MenuButton>
      <MenuButton
        disabled={isLoggingOut}
        icon={<LogOut size={18} />}
        onClick={onLogout}
        tone="danger"
      >
        {isLoggingOut ? ru.auth.loggingOut : "Выйти"}
      </MenuButton>
    </motion.div>
  );
}

function MenuButton({
  children,
  disabled = false,
  icon,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`flex h-11 w-full items-center gap-3 px-3 text-left text-sm transition hover:bg-[var(--hover-soft)] disabled:cursor-not-allowed disabled:opacity-60 ${
        tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-main)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--text-muted)]">
        {icon}
      </span>
      {children}
    </button>
  );
}

function ChatList({
  chats,
  compact,
  isLoading,
  messagePreviewEnabled,
  onSelectChat,
  selectedChatId,
}: {
  chats: Chat[];
  compact: boolean;
  isLoading: boolean;
  messagePreviewEnabled: boolean;
  onSelectChat: (chat: Chat) => void;
  selectedChatId: string | null;
}) {
  if (isLoading) {
    return <ChatListSkeleton compact={compact} />;
  }

  if (!chats.length) {
    return <StateMessage>{ru.chats.noChats}</StateMessage>;
  }

  return (
    <ul className="divide-y divide-[var(--border-soft)]">
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            className={`flex w-full items-center px-4 py-3 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
              selectedChatId === chat.id
                ? "bg-[var(--active-soft)]"
                : "hover:bg-[var(--hover-soft)]"
            } ${compact ? "justify-center px-3" : "gap-3"}`}
            onClick={() => onSelectChat(chat)}
            type="button"
            title={chat.partner?.username ? `@${chat.partner.username}` : ru.chats.privateChat}
          >
            <Avatar
              avatarUrl={chat.partner?.avatarUrl ?? null}
              label={chat.partner ? getUserDisplayName(chat.partner) : ru.chats.privateChat}
            />
            <div className={`min-w-0 ${compact ? "hidden" : "block"}`}>
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--text-main)]">
                  {chat.partner ? getUserDisplayName(chat.partner) : ru.chats.privateChat}
                </p>
                {chat.lastMessageAt ? (
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {formatChatListTime(chat.lastMessageAt)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">
                  {formatLastMessagePreview(chat, messagePreviewEnabled)}
                </p>
                {chat.unreadCount > 0 ? (
                  <UnreadBadge count={chat.unreadCount} />
                ) : null}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChatListSkeleton({
  compact,
  rows = 7,
}: {
  compact: boolean;
  rows?: number;
}) {
  return (
    <div className="divide-y divide-[var(--border-soft)]">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className={`flex items-center px-4 py-3 ${compact ? "justify-center px-3" : "gap-3"}`}
          key={index}
        >
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--input-bg)]" />
          {compact ? null : (
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-[var(--input-bg)]" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--input-bg)]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm">
      {count > 99 ? "99+" : count}
    </span>
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
    return <ChatListSkeleton compact={compact} rows={3} />;
  }

  if (error) {
    return <StateMessage tone="error">{error}</StateMessage>;
  }

  if (!results.length) {
    return <StateMessage>{ru.chats.noUsersFound}</StateMessage>;
  }

  return (
    <ul className="divide-y divide-[var(--border-soft)]">
      {results.map((user) => (
        <li key={user.id}>
          <button
            className={`flex w-full items-center px-4 py-3 text-left transition duration-150 hover:bg-[var(--hover-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
              compact ? "justify-center px-3" : "gap-3"
            }`}
            disabled={pendingUserId === user.id}
            onClick={() => onUserClick(user)}
            type="button"
            title={`@${user.username}`}
          >
            <Avatar
              avatarUrl={user.avatarUrl}
              label={getUserDisplayName(user)}
            />
            <div className={`min-w-0 ${compact ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-medium text-[var(--text-main)]">
                {getUserDisplayName(user)}
              </p>
              <p className="truncate text-sm text-[var(--text-muted)]">
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
  isMobile,
  isSending,
  isUploadingMedia,
  messageError,
  messageText,
  messages,
  messagesEndRef,
  onBackToChats,
  onMediaChange,
  onOpenMenu,
  onOpenProfile,
  onMessageTextChange,
  onSendMessage,
  selectedChat,
  typingUsers,
}: {
  currentUserId: string | null;
  isLoadingMessages: boolean;
  isMobile: boolean;
  isSending: boolean;
  isUploadingMedia: boolean;
  messageError: string | null;
  messageText: string;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onBackToChats: () => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenMenu: () => void;
  onOpenProfile: (username: string) => void;
  onMessageTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  selectedChat: Chat | null;
  typingUsers: TypingUser[];
}) {
  const typingText = getTypingText(typingUsers);

  return (
    <motion.section
      className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-bg)] md:flex ${
        selectedChat ? "flex" : "hidden"
      }`}
      initial={false}
    >
      {selectedChat?.partner ? (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="flex h-full min-h-0 flex-col"
          initial={isMobile ? { opacity: 0.96, x: 32 } : { opacity: 1, x: 0 }}
          key={selectedChat.id}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="flex h-[64px] shrink-0 items-center gap-3 border-b border-[var(--border-soft)] bg-[var(--panel-bg)] px-3 md:h-[73px] md:px-5">
            <button
              aria-label="Открыть меню"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] md:hidden"
              onClick={onOpenMenu}
              type="button"
            >
              <Menu size={22} />
            </button>
            <button
              aria-label={ru.chats.backToChats}
              className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-[15px] font-medium text-[var(--accent)] transition hover:bg-[var(--hover-soft)] md:hidden"
              onClick={onBackToChats}
              type="button"
            >
              <span aria-hidden="true">{"<"}</span>
              <span>{ru.chats.back}</span>
            </button>
            <button
              className="flex min-w-0 items-center gap-3 rounded-md text-left transition hover:bg-[var(--hover-soft)]"
              onClick={() => {
                if (selectedChat.partner) {
                  onOpenProfile(selectedChat.partner.username);
                }
              }}
              title={`@${selectedChat.partner.username}`}
              type="button"
            >
              <Avatar
                avatarUrl={selectedChat.partner.avatarUrl}
                label={getUserDisplayName(selectedChat.partner)}
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">
                  {getUserDisplayName(selectedChat.partner)}
                </p>
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {typingText ?? `@${selectedChat.partner.username}`}
                </p>
              </div>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-5 md:py-5">
            {isLoadingMessages ? (
              <MessageSkeleton />
            ) : messages.length ? (
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {messages.map((message, index) => {
                    const previousMessage = messages[index - 1];
                    const showDateSeparator =
                      !previousMessage ||
                      !isSameMessageDay(previousMessage.createdAt, message.createdAt);

                    return (
                      <motion.div
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        initial={{ opacity: 0, y: 8, scale: 0.99 }}
                        key={message.id}
                        layout
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        {showDateSeparator ? (
                          <DateSeparator value={message.createdAt} />
                        ) : null}
                        <MessageBubble
                          isOwn={message.senderId === currentUserId}
                          message={message}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--panel-bg)] text-2xl font-semibold text-[var(--accent)]">
                    {getUserDisplayName(selectedChat.partner).slice(0, 1).toUpperCase()}
                  </div>
                  <h1 className="text-xl font-semibold text-[var(--text-main)] md:text-2xl">
                    {ru.chats.chatWith(selectedChat.partner.username)}
                  </h1>
                  <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                    {ru.chats.firstMessageHint}
                  </p>
                  <div ref={messagesEndRef} />
                </motion.div>
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-[var(--border-soft)] bg-[var(--panel-bg)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4"
            onSubmit={onSendMessage}
          >
            {messageError ? (
              <p className="mb-2 text-sm text-[var(--danger)]">{messageError}</p>
            ) : null}
            {isUploadingMedia ? (
              <p className="mb-2 text-sm text-[var(--text-muted)]">{ru.chats.uploading}</p>
            ) : null}
            <div className="flex min-w-0 items-end gap-2 md:gap-3">
              <label
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] text-xl font-semibold text-[var(--accent)] transition hover:bg-[var(--hover-soft)] ${
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
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 py-3 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
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
                className="h-11 shrink-0 rounded-md bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 md:px-5"
                disabled={isSending || isUploadingMedia || !messageText.trim()}
                type="submit"
              >
                {isSending ? ru.chats.sending : ru.chats.send}
              </button>
            </div>
          </form>
        </motion.div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--panel-bg)] text-2xl font-semibold text-[var(--accent)]">
              L
            </div>
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              {ru.chats.chooseChat}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              {ru.chats.chooseChatHint}
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-3">
      {[
        "mr-auto w-[68%]",
        "ml-auto w-[56%]",
        "mr-auto w-[48%]",
        "ml-auto w-[72%]",
      ].map((widthClass, index) => (
        <div className={`flex ${widthClass.startsWith("ml") ? "justify-end" : "justify-start"}`} key={index}>
          <div
            className={`h-16 animate-pulse rounded-2xl bg-[var(--panel-bg)] ${widthClass}`}
          />
        </div>
      ))}
    </div>
  );
}

function DateSeparator({ value }: { value: string }) {
  return (
    <div className="sticky top-2 z-[1] my-3 flex justify-center">
      <span className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-elevated)]/90 px-3 py-1 text-xs font-medium text-[var(--text-muted)] shadow-sm backdrop-blur">
        {formatMessageDate(value)}
      </span>
    </div>
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
        className={`max-w-[86%] px-3 py-2 text-[15px] leading-5 shadow-sm md:max-w-[68%] ${
          isOwn
            ? "rounded-2xl rounded-br-md bg-[var(--accent)] text-white"
            : "rounded-2xl rounded-bl-md border border-[var(--border-soft)] bg-[var(--panel-bg)] text-[var(--text-main)]"
        }`}
      >
        <MessageMedia message={message} />
        {message.text ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : null}
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            isOwn ? "text-white/75" : "text-[var(--text-muted)]"
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
      className="mb-2 flex max-w-[280px] items-center gap-3 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-[var(--text-main)] transition hover:bg-black/20"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent)]/20 text-xs font-semibold text-[var(--text-main)]">
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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-sm font-semibold text-[var(--accent)]">
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
          ? "px-4 py-8 text-center text-sm text-[var(--danger)]"
          : "px-4 py-8 text-center text-sm text-[var(--text-muted)]"
      }
    >
      {children}
    </div>
  );
}

function getUserLabel(user: AuthUser | null) {
  return user ? getUserDisplayName(user) : "Linka";
}

function getUserDisplayName(user: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username: string;
  nameEmoji?: string | null;
}) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const name = user.displayName || fullName || user.username;
  return [user.nameEmoji, name].filter(Boolean).join(" ");
}

function sortChatsByLastMessage(chats: Chat[]) {
  return [...chats].sort((left, right) => {
    const leftTime = left.lastMessageAt ?? left.updatedAt;
    const rightTime = right.lastMessageAt ?? right.updatedAt;

    return new Date(rightTime).getTime() - new Date(leftTime).getTime();
  });
}

function formatLastMessagePreview(chat: Chat, messagePreviewEnabled: boolean) {
  if (!chat.lastMessage) {
    return chat.partner ? `@${chat.partner.username}` : ru.chats.noParticipant;
  }

  if (!messagePreviewEnabled) {
    return "Новое сообщение";
  }

  if (chat.lastMessage.text?.trim()) {
    return chat.lastMessage.text.trim();
  }

  if (chat.lastMessage.mediaType === "image") {
    return "Фото";
  }

  if (chat.lastMessage.mediaType === "video") {
    return "Видео";
  }

  if (chat.lastMessage.mediaType === "audio") {
    return "Аудио";
  }

  if (chat.lastMessage.mediaType === "document") {
    return "Документ";
  }

  return "Сообщение";
}

function formatChatListTime(value: string) {
  const date = new Date(value);

  if (isSameMessageDay(value, new Date().toISOString())) {
    return formatMessageTime(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function playFallbackTone() {
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const audioContext = new AudioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    520,
    audioContext.currentTime + 0.12,
  );
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.17);
}

function getThemeLabel(theme: ThemeMode) {
  if (theme === "light") {
    return "Light";
  }

  if (theme === "dark") {
    return "Dark";
  }

  return "System";
}

function getThemeIcon(theme: ThemeMode) {
  if (theme === "light") {
    return <Sun size={18} />;
  }

  if (theme === "dark") {
    return <Moon size={18} />;
  }

  return <Monitor size={18} />;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameMessageDay(value, today.toISOString())) {
    return "Сегодня";
  }

  if (isSameMessageDay(value, yesterday.toISOString())) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
  }).format(date);
}

function isSameMessageDay(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
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
