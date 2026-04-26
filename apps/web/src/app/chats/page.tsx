"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Chat, createPrivateChat, getChats } from "@/lib/api/chats";
import { getMessages, Message } from "@/lib/api/messages";
import { getSocket } from "@/lib/socket/client";
import { ru } from "@/lib/i18n/ru";
import { searchUsers } from "@/lib/api/users";
import { AuthUser, useAuthStore } from "@/store/auth-store";

const SIDEBAR_WIDTH_STORAGE_KEY = "linka.sidebar.width";
const MIN_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 420;
const COMPACT_SIDEBAR_WIDTH = 96;

export default function ChatsPage() {
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
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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
    }

    void loadMessages(selectedChat.id);
    socket?.emit("joinChat", { chatId: selectedChat.id });
    socket?.on("newMessage", handleNewMessage);
    socket?.on("connect_error", () => {
      setMessageError(ru.chats.errors.realtimeConnection);
    });

    return () => {
      isActive = false;
      socket?.emit("leaveChat", { chatId: selectedChat.id });
      socket?.off("newMessage", handleNewMessage);
      socket?.off("connect_error");
    };
  }, [selectedChat]);

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

  function handleBackToChats() {
    setSelectedChat(null);
    setMessageError(null);
  }

  function handleSidebarResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    if (isMobile !== false) {
      return;
    }

    event.preventDefault();
    setIsResizingSidebar(true);
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
            <Avatar
              avatarUrl={currentUser?.avatarUrl ?? null}
              label={getUserLabel(currentUser)}
            />
            <div className={`min-w-0 ${isCompactSidebar ? "hidden" : "block"}`}>
              <p className="truncate text-[15px] font-semibold text-white">
                {currentUser?.displayName || currentUser?.username || "Linka"}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                @{currentUser?.username ?? ru.chats.loadingProfile}
              </p>
            </div>
          </div>
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
        messageError={messageError}
        messageText={messageText}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onBackToChats={handleBackToChats}
        onMessageTextChange={setMessageText}
        onSendMessage={handleSendMessage}
        selectedChat={selectedChat}
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
  messageError,
  messageText,
  messages,
  messagesEndRef,
  onBackToChats,
  onMessageTextChange,
  onSendMessage,
  selectedChat,
}: {
  currentUserId: string | null;
  isLoadingMessages: boolean;
  isSending: boolean;
  messageError: string | null;
  messageText: string;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onBackToChats: () => void;
  onMessageTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  selectedChat: Chat | null;
}) {
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
                @{selectedChat.partner.username}
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
            <div className="flex min-w-0 items-end gap-2 md:gap-3">
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
                disabled={isSending || !messageText.trim()}
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
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={`mt-1 text-right text-[11px] ${
            isOwn ? "text-white/75" : "text-[#8fa3b5]"
          }`}
        >
          {formatMessageTime(message.createdAt)}
        </p>
      </div>
    </div>
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
        <img alt="" className="h-full w-full object-cover" src={avatarUrl} />
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

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)),
  );
}
