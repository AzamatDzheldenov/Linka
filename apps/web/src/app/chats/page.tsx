"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Chat, createPrivateChat, getChats } from "@/lib/api/chats";
import { getMessages, Message } from "@/lib/api/messages";
import { getSocket } from "@/lib/socket/client";
import { searchUsers } from "@/lib/api/users";
import { AuthUser, useAuthStore } from "@/store/auth-store";

export default function ChatsPage() {
  const currentUser = useAuthStore((state) => state.currentUser);
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadChats() {
      setIsLoadingChats(true);

      try {
        const nextChats = await getChats();

        if (isActive) {
          setChats(nextChats);
          setSelectedChat((current) =>
            current
              ? nextChats.find((chat) => chat.id === current.id) ?? current
              : nextChats[0] ?? null,
          );
        }
      } catch {
        if (isActive) {
          setError("Could not load chats.");
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
  }, []);

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
          setError("Could not search users.");
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
          setMessageError("Could not load messages.");
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
      setMessageError("Realtime connection failed.");
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
      setError("Could not create chat.");
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
      setMessageError("Realtime connection is not ready.");
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
          setMessageError(response.error);
          return;
        }

        setMessageText("");
      },
    );
  }

  return (
    <main className="flex min-h-screen bg-[#0e1621] text-[#f5f8fb]">
      <aside className="flex w-full max-w-[420px] flex-col border-r border-white/5 bg-[#17212b] sm:min-w-[360px]">
        <header className="border-b border-white/5 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar
              avatarUrl={currentUser?.avatarUrl ?? null}
              label={getUserLabel(currentUser)}
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-white">
                {currentUser?.displayName || currentUser?.username || "Linka"}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                @{currentUser?.username ?? "loading"}
              </p>
            </div>
          </div>
        </header>

        <div className="border-b border-white/5 px-4 py-3">
          <label className="block">
            <span className="sr-only">Search users</span>
            <input
              className="h-11 w-full rounded-md border border-white/5 bg-[#242f3d] px-4 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users"
              autoComplete="off"
            />
          </label>
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto">
          {query.trim() ? (
            <SearchResults
              error={error}
              isSearching={isSearching}
              onUserClick={handleUserClick}
              pendingUserId={pendingUserId}
              results={results}
            />
          ) : (
            <ChatList
              chats={chats}
              isLoading={isLoadingChats}
              onSelectChat={setSelectedChat}
              selectedChatId={selectedChat?.id ?? null}
            />
          )}
        </section>
      </aside>

      <ChatArea
        currentUserId={currentUser?.id ?? null}
        isLoadingMessages={isLoadingMessages}
        isSending={isSending}
        messageError={messageError}
        messageText={messageText}
        messages={messages}
        messagesEndRef={messagesEndRef}
        onMessageTextChange={setMessageText}
        onSendMessage={handleSendMessage}
        selectedChat={selectedChat}
      />
    </main>
  );
}

function ChatList({
  chats,
  isLoading,
  onSelectChat,
  selectedChatId,
}: {
  chats: Chat[];
  isLoading: boolean;
  onSelectChat: (chat: Chat) => void;
  selectedChatId: string | null;
}) {
  if (isLoading) {
    return <StateMessage>Loading chats...</StateMessage>;
  }

  if (!chats.length) {
    return <StateMessage>Search users to start a private chat.</StateMessage>;
  }

  return (
    <ul className="divide-y divide-white/5">
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
              selectedChatId === chat.id
                ? "bg-[#2aabee]/15"
                : "hover:bg-white/[0.03]"
            }`}
            onClick={() => onSelectChat(chat)}
            type="button"
          >
            <Avatar
              avatarUrl={chat.partner?.avatarUrl ?? null}
              label={chat.partner?.displayName || chat.partner?.username || "Chat"}
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-white">
                {chat.partner?.displayName || chat.partner?.username || "Private chat"}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                {chat.partner ? `@${chat.partner.username}` : "No participant"}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchResults({
  error,
  isSearching,
  onUserClick,
  pendingUserId,
  results,
}: {
  error: string | null;
  isSearching: boolean;
  onUserClick: (user: AuthUser) => void;
  pendingUserId: string | null;
  results: AuthUser[];
}) {
  if (isSearching) {
    return <StateMessage>Searching...</StateMessage>;
  }

  if (error) {
    return <StateMessage tone="error">{error}</StateMessage>;
  }

  if (!results.length) {
    return <StateMessage>No users found.</StateMessage>;
  }

  return (
    <ul className="divide-y divide-white/5">
      {results.map((user) => (
        <li key={user.id}>
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pendingUserId === user.id}
            onClick={() => onUserClick(user)}
            type="button"
          >
            <Avatar
              avatarUrl={user.avatarUrl}
              label={user.displayName || user.username}
            />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-white">
                {user.displayName || user.username}
              </p>
              <p className="truncate text-sm text-[#8fa3b5]">
                {pendingUserId === user.id ? "Opening chat..." : `@${user.username}`}
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
  onMessageTextChange: (value: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  selectedChat: Chat | null;
}) {
  return (
    <section className="hidden min-w-0 flex-1 flex-col bg-[#0e1621] sm:flex">
      {selectedChat?.partner ? (
        <>
          <header className="flex h-[73px] shrink-0 items-center gap-3 border-b border-white/5 bg-[#17212b] px-5">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {isLoadingMessages ? (
              <StateMessage>Loading messages...</StateMessage>
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
                    {`\u0427\u0430\u0442 \u0441 @${selectedChat.partner.username}`}
                  </h1>
                  <p className="mt-2 max-w-sm text-sm text-[#8fa3b5]">
                    {"\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043f\u0435\u0440\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0432 Linka."}
                  </p>
                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-white/5 bg-[#17212b] px-4 py-3"
            onSubmit={onSendMessage}
          >
            {messageError ? (
              <p className="mb-2 text-sm text-red-200">{messageError}</p>
            ) : null}
            <div className="flex items-end gap-3">
              <textarea
                className="max-h-32 min-h-11 flex-1 resize-none rounded-md border border-white/5 bg-[#242f3d] px-4 py-3 text-[15px] text-white outline-none transition placeholder:text-[#6f8191] focus:border-[#2aabee] focus:ring-2 focus:ring-[#2aabee]/25"
                onChange={(event) => onMessageTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Message"
                value={messageText}
              />
              <button
                className="h-11 rounded-md bg-[#2aabee] px-5 text-[15px] font-semibold text-white transition hover:bg-[#239bd8] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSending || !messageText.trim()}
                type="submit"
              >
                {isSending ? "Sending..." : "Send"}
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
              {"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442"}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-[#8fa3b5]">
              {"\u041d\u0430\u0439\u0434\u0438\u0442\u0435 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0441\u043b\u0435\u0432\u0430 \u0438 \u043e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0447\u0430\u0442 \u0432 Linka."}
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
        className={`max-w-[70%] rounded-lg px-3 py-2 text-[15px] shadow-sm ${
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
