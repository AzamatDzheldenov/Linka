"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  ChevronLeft,
  Forward,
  Image,
  LogOut,
  Megaphone,
  Menu,
  Mic,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import {
  Chat,
  ChatType,
  ChannelSubscriber,
  GroupInvite,
  addChatMembers,
  createChannel,
  createGroupChat,
  createPrivateChat,
  getGroupInvites,
  getChats,
  getSubscribers,
  respondToGroupInvite,
  updateChatMemberRole,
  updateChatSettings,
  uploadChatAvatar,
  uploadChatWallpaper,
} from "@/lib/api/chats";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import {
  deleteMessage,
  forwardMessage,
  getMessageMediaBlob,
  getMessages,
  Message,
  MessagePreview,
  MessageReactionGroup,
  MessageReactionUpdate,
  sendMediaMessage,
  toggleMessageReaction,
} from "@/lib/api/messages";
import { logout } from "@/lib/api/auth";
import {
  emitTypingStart,
  emitTypingStop,
  getSocket,
} from "@/lib/socket/client";
import { t as ru } from "@/lib/i18n";
import { useI18n } from "@/providers/i18n-provider";
import {
  UserSettings,
  getUserSettings,
  searchUsers,
  uploadAvatar,
} from "@/lib/api/users";
import { AuthUser, useAuthStore } from "@/store/auth-store";
import { ThemeMode, useTheme } from "@/providers/theme-provider";
import { LinkaBrand, LinkaIcon } from "@/components/linka-brand";
import { AppBottomNav } from "@/components/ui/app-bottom-nav";
import {
  QUICK_MESSAGE_REACTION,
  SUPPORTED_MESSAGE_REACTIONS,
} from "@/lib/message-reactions";

const SIDEBAR_WIDTH_STORAGE_KEY = "linka.sidebar.width";
const MIN_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 420;
const COMPACT_SIDEBAR_WIDTH = 96;
const TYPING_STOP_DELAY_MS = 1400;
const VOICE_HOLD_THRESHOLD_MS = 260;
const MIN_VOICE_DURATION_MS = 700;
const VOICE_MIME_TYPE_OPTIONS = ["audio/webm;codecs=opus", "audio/webm"] as const;
const EMPTY_CHAT_GIFS = [
  {
    aspectRatio: "480 / 346",
    src: "https://media.giphy.com/media/MMquV2oInK40V86Q7g/giphy.gif",
  },
  {
    aspectRatio: "1 / 1",
    src: "https://media.giphy.com/media/G6TgcESZt8FFk8XV7K/giphy.gif",
  },
  {
    aspectRatio: "1 / 1",
    src: "https://media.giphy.com/media/4uVyQiFGLicuI/giphy.gif",
  },
] as const;

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

type SharedChatKind = Extract<ChatType, "group" | "channel">;

export default function ChatsPage() {
  useI18n();
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.currentUser);
  const { cycleTheme, theme } = useTheme();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [sharedChatKind, setSharedChatKind] = useState<SharedChatKind | null>(
    null,
  );
  const [sharedChatTitle, setSharedChatTitle] = useState("");
  const [sharedChatQuery, setSharedChatQuery] = useState("");
  const [sharedChatResults, setSharedChatResults] = useState<AuthUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<AuthUser[]>([]);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthUser[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [messageText, setMessageText] = useState("");
  const [selectedReplyMessage, setSelectedReplyMessage] = useState<Message | null>(
    null,
  );
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardQuery, setForwardQuery] = useState("");
  const [selectedForwardChatIds, setSelectedForwardChatIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isCreatingSharedChat, setIsCreatingSharedChat] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isSavingGroupSettings, setIsSavingGroupSettings] = useState(false);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const preserveMessageScrollRef = useRef(false);
  const typingStopTimeoutRef = useRef<number | null>(null);
  const activeTypingChatIdRef = useRef<string | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const isWindowFocusedRef = useRef(true);
  const canPlayAudioRef = useRef(false);
  const messageAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChatIdRef = useRef<string | null>(null);
  const voiceStartTimeRef = useRef(0);
  const voiceStopActionRef = useRef<"send" | "cancel">("send");
  const pendingVoiceStopActionRef = useRef<"send" | "cancel" | null>(null);
  const voicePointerStartedAtRef = useRef<number | null>(null);
  const suppressNextVoiceClickRef = useRef(false);
  const isRecordingVoiceRef = useRef(false);
  const isCompactSidebar = !isMobile && sidebarWidth <= COMPACT_SIDEBAR_WIDTH;

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChat?.id ?? null;
  }, [selectedChat?.id]);

  useEffect(() => {
    setSelectedReplyMessage(null);
    setForwardingMessage(null);
    setForwardQuery("");
    setSelectedForwardChatIds([]);
    setMessageNotice(null);
  }, [selectedChat?.id]);

  useEffect(() => {
    if (isRecordingVoiceRef.current) {
      stopVoiceRecording("cancel");
    }
  }, [selectedChat?.id]);

  useEffect(() => {
    isRecordingVoiceRef.current = isRecordingVoice;
  }, [isRecordingVoice]);

  useEffect(() => {
    if (!isRecordingVoice || !recordingStartedAt) {
      return;
    }

    setRecordingDuration(Date.now() - recordingStartedAt);
    const intervalId = window.setInterval(() => {
      setRecordingDuration(Date.now() - recordingStartedAt);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRecordingVoice, recordingStartedAt]);

  useEffect(() => {
    return () => {
      cleanupVoiceStream();
    };
  }, []);

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
    const mediaQuery = window.matchMedia("(max-width: 1023px)");

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
        const [nextChats, nextInvites] = await Promise.all([
          getChats(),
          getGroupInvites(),
        ]);

        if (isActive) {
          setChats(sortChatsByLastMessage(nextChats));
          setGroupInvites(nextInvites);
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
    const normalizedQuery = sharedChatQuery.trim();

    if (!sharedChatKind || !normalizedQuery) {
      setSharedChatResults([]);
      setIsSearchingMembers(false);
      return;
    }

    let isActive = true;
    setIsSearchingMembers(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const users = await searchUsers(normalizedQuery);

        if (isActive) {
          const selectedIds = new Set(selectedMembers.map((user) => user.id));
          setSharedChatResults(
            users.filter(
              (user) => user.id !== currentUser?.id && !selectedIds.has(user.id),
            ),
          );
        }
      } catch {
        if (isActive) {
          setSharedChatResults([]);
        }
      } finally {
        if (isActive) {
          setIsSearchingMembers(false);
        }
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [currentUser?.id, selectedMembers, sharedChatKind, sharedChatQuery]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setHasOlderMessages(false);
      setOlderMessagesCursor(null);
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
          setMessages(history.messages);
          setHasOlderMessages(history.hasMore);
          setOlderMessagesCursor(history.nextCursor);
          if (userSettings?.showReadReceipts !== false) {
            socket?.emit("markAsRead", { chatId });
          }
        }
      } catch {
        if (isActive) {
          setMessages([]);
          setHasOlderMessages(false);
          setOlderMessagesCursor(null);
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

    function handleMessageUpdated(message: Message) {
      if (message.chatId !== selectedChat?.id) {
        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((item) => (item.id === message.id ? message : item)),
      );
    }

    function handleMessageDelivered(payload: ReceiptUpdate) {
      updateMessageReceipts(payload, "delivered");
    }

    function handleMessageRead(payload: ReceiptUpdate) {
      updateMessageReceipts(payload, "read");
    }

    function handleMessageReactionUpdated(payload: MessageReactionUpdate) {
      if (payload.chatId !== selectedChat?.id) {
        return;
      }

      applyReactionUpdate(payload, { preserveReactedByMe: true });
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
    socket?.on("message:updated", handleMessageUpdated);
    socket?.on("message:delivered", handleMessageDelivered);
    socket?.on("message:read", handleMessageRead);
    socket?.on("message_reaction_updated", handleMessageReactionUpdated);
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
      socket?.off("message:updated", handleMessageUpdated);
      socket?.off("message:delivered", handleMessageDelivered);
      socket?.off("message:read", handleMessageRead);
      socket?.off("message_reaction_updated", handleMessageReactionUpdated);
      socket?.off("userTyping:start", handleTypingStart);
      socket?.off("userTyping:stop", handleTypingStop);
      socket?.off("connect_error");
    };
  }, [currentUser?.id, selectedChat, userSettings?.showReadReceipts]);

  function applyReactionUpdate(
    payload: MessageReactionUpdate,
    options: { preserveReactedByMe?: boolean } = {},
  ) {
    const preserveReactedByMe = options.preserveReactedByMe ?? false;

    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== payload.messageId) {
          return message;
        }

        return {
          ...message,
          reactions: mergeReactionGroups(
            message.reactions ?? [],
            payload.reactions,
            preserveReactedByMe,
          ),
        };
      }),
    );

    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== payload.chatId || chat.lastMessage?.id !== payload.messageId) {
          return chat;
        }

        return {
          ...chat,
          lastMessage: {
            ...chat.lastMessage,
            reactions: mergeReactionGroups(
              chat.lastMessage.reactions ?? [],
              payload.reactions,
              preserveReactedByMe,
            ),
          },
        };
      }),
    );
  }

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

  async function handleLoadOlderMessages() {
    if (!selectedChat || isLoadingOlderMessages || !hasOlderMessages) {
      return;
    }

    const cursor = olderMessagesCursor ?? messages[0]?.id;
    if (!cursor) {
      setHasOlderMessages(false);
      return;
    }

    const scrollContainer = messagesScrollRef.current;
    const previousScrollHeight = scrollContainer?.scrollHeight ?? 0;
    const previousScrollTop = scrollContainer?.scrollTop ?? 0;
    const requestedChatId = selectedChat.id;

    setIsLoadingOlderMessages(true);
    setMessageError(null);

    try {
      const history = await getMessages(requestedChatId, cursor);

      if (selectedChatIdRef.current !== requestedChatId) {
        return;
      }

      preserveMessageScrollRef.current = true;
      setMessages((currentMessages) => {
        const currentIds = new Set(currentMessages.map((message) => message.id));
        const olderMessages = history.messages.filter(
          (message) => !currentIds.has(message.id),
        );

        return [...olderMessages, ...currentMessages];
      });
      setHasOlderMessages(history.hasMore);
      setOlderMessagesCursor(history.nextCursor);

      window.requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop =
            scrollContainer.scrollHeight - previousScrollHeight + previousScrollTop;
        }
      });
    } catch {
      setMessageError(ru.chats.errors.loadMessages);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }

  useEffect(() => {
    if (preserveMessageScrollRef.current) {
      preserveMessageScrollRef.current = false;
      return;
    }

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

  function handleOpenSharedChatModal(kind: SharedChatKind) {
    setSharedChatKind(kind);
    setIsCreateMenuOpen(false);
    setSharedChatTitle("");
    setSharedChatQuery("");
    setSharedChatResults([]);
    setSelectedMembers([]);
    setError(null);
  }

  function handleCloseSharedChatModal() {
    if (isCreatingSharedChat) {
      return;
    }

    setSharedChatKind(null);
    setSharedChatTitle("");
    setSharedChatQuery("");
    setSharedChatResults([]);
    setSelectedMembers([]);
  }

  function handleToggleSelectedMember(user: AuthUser) {
    setSelectedMembers((currentMembers) =>
      currentMembers.some((member) => member.id === user.id)
        ? currentMembers.filter((member) => member.id !== user.id)
        : [...currentMembers, user],
    );
  }

  async function handleCreateSharedChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sharedChatKind) {
      return;
    }

    const title = sharedChatTitle.trim();
    const memberIds = selectedMembers.map((member) => member.id);

    if (!title || !memberIds.length) {
      setError(ru.chats.errors.createSharedChat);
      return;
    }

    setIsCreatingSharedChat(true);
    setError(null);

    try {
      const chat =
        sharedChatKind === "group"
          ? await createGroupChat({ title, memberIds })
          : await createChannel({ title, memberIds });

      setSelectedChat(chat);
      setIsMobileDrawerOpen(false);
      setChats((currentChats) => {
        const withoutChat = currentChats.filter((item) => item.id !== chat.id);
        return sortChatsByLastMessage([chat, ...withoutChat]);
      });
      setSharedChatKind(null);
      setSharedChatTitle("");
      setSharedChatQuery("");
      setSharedChatResults([]);
      setSelectedMembers([]);
    } catch {
      setError(ru.chats.errors.createSharedChat);
    } finally {
      setIsCreatingSharedChat(false);
    }
  }

  async function handleRespondToInvite(
    invite: GroupInvite,
    status: "accepted" | "declined",
  ) {
    setPendingInviteId(invite.id);
    setError(null);

    try {
      const response = await respondToGroupInvite(invite.id, status);
      setGroupInvites((currentInvites) =>
        currentInvites.filter((item) => item.id !== invite.id),
      );

      if (status === "accepted" && "unreadCount" in response) {
        setChats((currentChats) => sortChatsByLastMessage([response, ...currentChats]));
        setSelectedChat(response);
        setIsMobileDrawerOpen(false);
      }
    } catch {
      setError(ru.chats.errors.respondInvite);
    } finally {
      setPendingInviteId(null);
    }
  }

  function mergeChat(chat: Chat) {
    setChats((currentChats) =>
      sortChatsByLastMessage(
        currentChats.map((item) => (item.id === chat.id ? chat : item)),
      ),
    );
    setSelectedChat((currentChat) =>
      currentChat?.id === chat.id ? chat : currentChat,
    );
  }

  async function handleSaveGroupTitle(title: string) {
    if (!selectedChat) {
      return;
    }

    setIsSavingGroupSettings(true);
    setMessageError(null);

    try {
      mergeChat(await updateChatSettings(selectedChat.id, { title }));
    } catch {
      setMessageError(ru.chats.errors.updateGroup);
    } finally {
      setIsSavingGroupSettings(false);
    }
  }

  async function handleAddGroupMembers(memberIds: string[]) {
    if (!selectedChat) {
      return;
    }

    setIsSavingGroupSettings(true);
    setMessageError(null);

    try {
      mergeChat(await addChatMembers(selectedChat.id, memberIds));
    } catch {
      setMessageError(ru.chats.errors.updateGroup);
    } finally {
      setIsSavingGroupSettings(false);
    }
  }

  async function handleUpdateGroupRole(
    userId: string,
    role: "admin" | "member" | "subscriber",
  ) {
    if (!selectedChat) {
      return;
    }

    setIsSavingGroupSettings(true);
    setMessageError(null);

    try {
      mergeChat(await updateChatMemberRole(selectedChat.id, userId, role));
    } catch {
      setMessageError(ru.chats.errors.updateGroup);
    } finally {
      setIsSavingGroupSettings(false);
    }
  }

  async function handleGroupAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!selectedChat || !file) {
      return;
    }

    setIsSavingGroupSettings(true);
    setMessageError(null);

    try {
      mergeChat(await uploadChatAvatar(selectedChat.id, file));
    } catch {
      setMessageError(ru.chats.errors.updateGroup);
    } finally {
      setIsSavingGroupSettings(false);
    }
  }

  async function handleGroupWallpaperChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!selectedChat || !file) {
      return;
    }

    setIsSavingGroupSettings(true);
    setMessageError(null);

    try {
      mergeChat(await uploadChatWallpaper(selectedChat.id, file));
    } catch {
      setMessageError(ru.chats.errors.updateGroup);
    } finally {
      setIsSavingGroupSettings(false);
    }
  }

  async function handleDeleteMessage(message: Message) {
    if (!selectedChat || deletingMessageId) {
      return;
    }

    setDeletingMessageId(message.id);
    setMessageError(null);

    try {
      const deletedMessage = await deleteMessage(selectedChat.id, message.id);
      setMessages((currentMessages) =>
        currentMessages.map((item) =>
          item.id === deletedMessage.id ? deletedMessage : item,
        ),
      );
    } catch {
      setMessageError(ru.chats.errors.deleteMessage);
    } finally {
      setDeletingMessageId(null);
    }
  }

  function handleReplyToMessage(message: Message) {
    if (message.deletedAt) {
      return;
    }

    setSelectedReplyMessage(message);
    setMessageNotice(null);
  }

  function handleOpenForward(message: Message) {
    setForwardingMessage(message);
    setSelectedForwardChatIds([]);
    setForwardQuery("");
    setMessageError(null);
    setMessageNotice(null);
  }

  function handleCloseForward() {
    if (isForwarding) {
      return;
    }

    setForwardingMessage(null);
    setSelectedForwardChatIds([]);
    setForwardQuery("");
  }

  function handleToggleForwardChat(chatId: string) {
    setSelectedForwardChatIds((currentIds) =>
      currentIds.includes(chatId)
        ? currentIds.filter((id) => id !== chatId)
        : [...currentIds, chatId],
    );
  }

  async function handleConfirmForward() {
    if (!forwardingMessage || !selectedForwardChatIds.length) {
      return;
    }

    setIsForwarding(true);
    setMessageError(null);
    setMessageNotice(null);

    try {
      await forwardMessage(forwardingMessage.id, selectedForwardChatIds);
      setForwardingMessage(null);
      setSelectedForwardChatIds([]);
      setForwardQuery("");
      setMessageNotice(ru.chats.forwardedMessage);
    } catch (error) {
      setMessageError(
        error instanceof ApiError ? error.message : ru.chats.errors.forwardMessage,
      );
    } finally {
      setIsForwarding(false);
    }
  }

  function handleReplyPreviewClick(preview: MessagePreview) {
    const element = document.getElementById(`message-${preview.id}`);

    if (!element) {
      setMessageNotice(ru.chats.originalMessageNotLoaded);
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("message-jump-highlight");
    window.setTimeout(() => {
      element.classList.remove("message-jump-highlight");
    }, 1200);
  }

  async function handleToggleReaction(message: Message, emoji: string) {
    if (!currentUser || message.deletedAt) {
      return;
    }

    const previousReactions = message.reactions ?? [];
    const optimisticReactions = toggleReactionOptimistically(
      message.reactions ?? [],
      emoji,
      {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        nameEmoji: currentUser.nameEmoji,
        avatarUrl: currentUser.avatarUrl,
      },
    );

    setMessageError(null);
    setMessages((currentMessages) =>
      currentMessages.map((currentMessage) => {
        if (currentMessage.id !== message.id) {
          return currentMessage;
        }
        return {
          ...currentMessage,
          reactions: optimisticReactions,
        };
      }),
    );

    try {
      const payload = await toggleMessageReaction(message.id, emoji);
      applyReactionUpdate(payload);
    } catch (error) {
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === message.id
            ? { ...currentMessage, reactions: previousReactions }
            : currentMessage,
        ),
      );

      setMessageError(formatReactionError(error));
    }
  }

  function handleMentionAll() {
    setMessageText((currentText) =>
      currentText.trim() ? `${currentText} @all ` : "@all ",
    );
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
      {
        chatId: selectedChat.id,
        text,
        replyToMessageId: selectedReplyMessage?.id,
      },
      (response: Message | { error?: string }) => {
        setIsSending(false);

        if (response && "error" in response && response.error) {
          setMessageError(ru.chats.errors.sendMessage);
          return;
        }

        setMessageText("");
        setSelectedReplyMessage(null);
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
      await sendMediaMessage(
        selectedChat.id,
        file,
        caption || undefined,
        selectedReplyMessage?.id,
      );
      stopTyping(selectedChat.id);
      setMessageText("");
      setSelectedReplyMessage(null);
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

  function cleanupVoiceStream() {
    mediaRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceChatIdRef.current = null;
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    pendingVoiceStopActionRef.current = null;
  }

  async function startVoiceRecording() {
    if (
      !selectedChat ||
      isRecordingVoiceRef.current ||
      isUploadingMedia ||
      isSendingVoice
    ) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessageError(ru.chats.errors.voiceUnsupported);
      return;
    }

    const mimeType = getSupportedVoiceMimeType();

    if (!mimeType) {
      setMessageError(ru.chats.errors.voiceUnsupported);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      const startedAt = Date.now();

      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceChatIdRef.current = selectedChat.id;
      voiceStartTimeRef.current = startedAt;
      voiceStopActionRef.current = "send";
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        void handleVoiceRecordingStop(mimeType);
      });

      recorder.start();
      setMessageError(null);
      setIsRecordingVoice(true);
      setRecordingStartedAt(startedAt);
      setRecordingDuration(0);
      stopTyping(selectedChat.id);

      const pendingStopAction = pendingVoiceStopActionRef.current;
      if (pendingStopAction) {
        pendingVoiceStopActionRef.current = null;
        window.setTimeout(() => stopVoiceRecording(pendingStopAction), 0);
      }
    } catch {
      cleanupVoiceStream();
      setMessageError(ru.chats.errors.voicePermission);
    }
  }

  function stopVoiceRecording(action: "send" | "cancel" = "send") {
    const recorder = mediaRecorderRef.current;
    voiceStopActionRef.current = action;

    if (!recorder) {
      pendingVoiceStopActionRef.current = action;
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
      return;
    }

    void handleVoiceRecordingStop(recorder.mimeType || "audio/webm");
  }

  async function handleVoiceRecordingStop(mimeType: string) {
    const chunks = voiceChunksRef.current;
    const chatId = voiceChatIdRef.current;
    const duration = Date.now() - voiceStartTimeRef.current;
    const shouldSend = voiceStopActionRef.current === "send";

    cleanupVoiceStream();
    setIsRecordingVoice(false);
    setRecordingStartedAt(null);
    setRecordingDuration(0);

    if (!shouldSend) {
      return;
    }

    if (!chatId || duration < MIN_VOICE_DURATION_MS || !chunks.length) {
      setMessageError(ru.chats.errors.voiceTooShort);
      return;
    }

    const voiceFile = new File(chunks, "voice-message.webm", {
      type: mimeType || "audio/webm",
    });

    setIsSendingVoice(true);
    setMessageError(null);

    try {
      await sendMediaMessage(chatId, voiceFile, undefined, selectedReplyMessage?.id);
      setSelectedReplyMessage(null);
    } catch (error) {
      setMessageError(
        error instanceof ApiError ? error.message : ru.chats.errors.uploadMedia,
      );
    } finally {
      setIsSendingVoice(false);
    }
  }

  function handleVoicePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || isUploadingMedia || isSendingVoice) {
      return;
    }

    voicePointerStartedAtRef.current = Date.now();

    if (isRecordingVoiceRef.current) {
      return;
    }

    suppressNextVoiceClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    void startVoiceRecording();
  }

  function handleVoicePointerUp() {
    const startedAt = voicePointerStartedAtRef.current;
    voicePointerStartedAtRef.current = null;

    if (!startedAt) {
      return;
    }

    const pressDuration = Date.now() - startedAt;

    if (pressDuration >= VOICE_HOLD_THRESHOLD_MS) {
      suppressNextVoiceClickRef.current = true;

      if (isRecordingVoiceRef.current) {
        stopVoiceRecording("send");
      } else {
        pendingVoiceStopActionRef.current = "send";
      }
    }
  }

  function handleVoicePointerCancel() {
    voicePointerStartedAtRef.current = null;

    if (isRecordingVoiceRef.current) {
      suppressNextVoiceClickRef.current = true;
      stopVoiceRecording("cancel");
    } else {
      pendingVoiceStopActionRef.current = "cancel";
    }
  }

  function handleVoiceClick() {
    if (suppressNextVoiceClickRef.current) {
      suppressNextVoiceClickRef.current = false;
      return;
    }

    if (isRecordingVoiceRef.current) {
      stopVoiceRecording("send");
      return;
    }

    void startVoiceRecording();
  }

  function handleBackToChats() {
    if (selectedChat) {
      stopTyping(selectedChat.id);
    }

    if (isRecordingVoiceRef.current) {
      stopVoiceRecording("cancel");
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
    setSelectedReplyMessage(null);
    setForwardingMessage(null);

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
            aria-label={ru.app.close}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden"
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
        className="fixed inset-y-0 left-0 z-50 flex min-h-0 w-full flex-col border-r border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-2xl shadow-black/25 lg:relative lg:z-auto lg:flex lg:shrink-0 lg:shadow-none"
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
          className={`hidden border-b border-[var(--border-soft)] bg-[var(--panel-floating)]/80 py-4 backdrop-blur-xl lg:block ${
            isCompactSidebar ? "px-3" : "px-4"
          }`}
        >
          <div className={`flex items-center ${isCompactSidebar ? "gap-1" : "gap-2"}`}>
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
                aria-label={ru.app.accountMenu}
                className={`ios-button flex shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] outline-none transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-wait disabled:opacity-70 ${
                  isCompactSidebar ? "h-8 w-8" : "h-10 w-10"
                }`}
                disabled={isUploadingAvatar}
                onClick={() => setIsUserMenuOpen((isOpen) => !isOpen)}
                title={ru.app.accountMenu}
                type="button"
              >
                <Menu size={isCompactSidebar ? 20 : 22} />
              </button>
              <AnimatePresence>
                {isUserMenuOpen ? (
                  <UserMenu
                    currentUser={currentUser}
                    isUploadingAvatar={isUploadingAvatar}
                    isLoggingOut={isLoggingOut}
                    onLogout={handleLogout}
                    onProfile={handleProfileClick}
                    onSettings={handleSettingsClick}
                    onTheme={handleThemeClick}
                    onUploadAvatar={() => profileFileInputRef.current?.click()}
                    theme={theme}
                  />
                ) : null}
              </AnimatePresence>
            </div>
            <LinkaBrand
              className="min-w-0"
              iconSize={isCompactSidebar ? 28 : 38}
              textClassName={isCompactSidebar ? "sr-only" : "truncate text-[var(--text-main)]"}
            />
            {isMobile ? (
              <button
                aria-label={ru.app.close}
                className="ios-button ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] lg:hidden"
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
          <div className="border-b border-[var(--border-soft)] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:py-3">
            <label className="block">
              <span className="sr-only">{ru.chats.searchUsers}</span>
              <input
                className="ios-input h-10 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={ru.chats.searchUsers}
                autoComplete="off"
              />
            </label>
          </div>
        )}

        <section className="ios-scroll min-h-0 flex-1 overflow-y-auto pb-28 lg:pb-24">
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
              groupInvites={groupInvites}
              isLoading={isLoadingChats}
              messagePreviewEnabled={userSettings?.messagePreviewEnabled !== false}
              onRespondToInvite={handleRespondToInvite}
              onSelectChat={handleSelectChat}
              pendingInviteId={pendingInviteId}
              selectedChatId={selectedChat?.id ?? null}
            />
          )}
        </section>

        <CreateChatFab
          compact={isCompactSidebar}
          isOpen={isCreateMenuOpen}
          onOpenChange={setIsCreateMenuOpen}
          onSelectKind={handleOpenSharedChatModal}
        />

        <button
          aria-label={ru.chats.resizeSidebar}
          className={`absolute -right-[5px] top-0 z-10 hidden h-full w-[10px] cursor-col-resize items-center justify-center lg:flex ${
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
        isLoadingOlderMessages={isLoadingOlderMessages}
        isGroupSettingsOpen={isGroupSettingsOpen}
        isSavingGroupSettings={isSavingGroupSettings}
        isSending={isSending}
        isUploadingMedia={isUploadingMedia}
        isRecordingVoice={isRecordingVoice}
        isSendingVoice={isSendingVoice}
        deletingMessageId={deletingMessageId}
        messageError={messageError}
        messageNotice={messageNotice}
        messageText={messageText}
        messages={messages}
        messagesScrollRef={messagesScrollRef}
        messagesEndRef={messagesEndRef}
        hasOlderMessages={hasOlderMessages}
        recordingDuration={recordingDuration}
        isMobile={isMobile === true}
        onBackToChats={handleBackToChats}
        onMediaChange={handleMediaChange}
        onVoiceClick={handleVoiceClick}
        onVoicePointerCancel={handleVoicePointerCancel}
        onVoicePointerDown={handleVoicePointerDown}
        onVoicePointerUp={handleVoicePointerUp}
        onAddGroupMembers={handleAddGroupMembers}
        onCloseGroupSettings={() => setIsGroupSettingsOpen(false)}
        onDeleteMessage={handleDeleteMessage}
        onForwardMessage={handleOpenForward}
        onGroupAvatarChange={handleGroupAvatarChange}
        onGroupWallpaperChange={handleGroupWallpaperChange}
        onLoadOlderMessages={handleLoadOlderMessages}
        onMentionAll={handleMentionAll}
        onOpenProfile={handleOpenProfile}
        onOpenGroupSettings={() => setIsGroupSettingsOpen(true)}
        onReplyPreviewClick={handleReplyPreviewClick}
        onReplyToMessage={handleReplyToMessage}
        onSaveGroupTitle={handleSaveGroupTitle}
        onToggleReaction={handleToggleReaction}
        onUpdateGroupRole={handleUpdateGroupRole}
        onMessageTextChange={handleMessageTextChange}
        onSendMessage={handleSendMessage}
        selectedChat={selectedChat}
        selectedReplyMessage={selectedReplyMessage}
        onCancelReply={() => setSelectedReplyMessage(null)}
        typingUsers={typingUsers}
      />
      <AnimatePresence>
        {forwardingMessage ? (
          <ForwardMessageModal
            chats={chats}
            currentChatId={selectedChat?.id ?? null}
            isForwarding={isForwarding}
            message={forwardingMessage}
            onClose={handleCloseForward}
            onConfirm={handleConfirmForward}
            onQueryChange={setForwardQuery}
            onToggleChat={handleToggleForwardChat}
            query={forwardQuery}
            selectedChatIds={selectedForwardChatIds}
          />
        ) : null}
        {sharedChatKind ? (
          <SharedChatModal
            error={error}
            isCreating={isCreatingSharedChat}
            isSearching={isSearchingMembers}
            kind={sharedChatKind}
            onClose={handleCloseSharedChatModal}
            onCreate={handleCreateSharedChat}
            onQueryChange={setSharedChatQuery}
            onTitleChange={setSharedChatTitle}
            onToggleMember={handleToggleSelectedMember}
            query={sharedChatQuery}
            results={sharedChatResults}
            selectedMembers={selectedMembers}
            title={sharedChatTitle}
          />
        ) : null}
      </AnimatePresence>
      <AppBottomNav hidden={Boolean(selectedChat && !isMobileDrawerOpen)} />
    </main>
  );
}

function UserMenu({
  currentUser,
  isLoggingOut,
  isUploadingAvatar,
  onLogout,
  onProfile,
  onSettings,
  onTheme,
  onUploadAvatar,
  theme,
}: {
  currentUser: AuthUser | null;
  isLoggingOut: boolean;
  isUploadingAvatar: boolean;
  onLogout: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onTheme: () => void;
  onUploadAvatar: () => void;
  theme: ThemeMode;
}) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="ios-glass absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-[22px] py-1"
      exit={{ opacity: 0, scale: 0.98, y: -6 }}
      initial={{ opacity: 0, scale: 0.98, y: -6 }}
      role="menu"
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-3 py-3">
        <Avatar
          avatarUrl={currentUser?.avatarUrl ?? null}
          label={getUserLabel(currentUser)}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">
            {currentUser ? getUserDisplayName(currentUser) : "Linka"}
          </p>
          <p className="truncate text-sm text-[var(--text-muted)]">
            @{currentUser?.username ?? ru.chats.loadingProfile}
          </p>
        </div>
      </div>
      <MenuButton
        disabled={isUploadingAvatar}
        icon={<Camera size={18} />}
        onClick={onUploadAvatar}
      >
        {isUploadingAvatar ? ru.chats.uploading : ru.chats.uploadAvatar}
      </MenuButton>
      <MenuButton icon={<User size={18} />} onClick={onProfile}>
        {ru.app.profile}
      </MenuButton>
      <MenuButton icon={<Settings size={18} />} onClick={onSettings}>
        {ru.app.settings}
      </MenuButton>
      <MenuButton icon={getThemeIcon(theme)} onClick={onTheme}>
        {ru.app.changeTheme}
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
        {isLoggingOut ? ru.auth.loggingOut : ru.auth.logout}
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

function CreateChatFab({
  compact,
  isOpen,
  onOpenChange,
  onSelectKind,
}: {
  compact: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectKind: (kind: SharedChatKind) => void;
}) {
  return (
    <div className="absolute bottom-[calc(5.35rem+env(safe-area-inset-bottom))] right-4 z-20 lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="ios-glass mb-3 w-56 overflow-hidden rounded-[22px] py-1"
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <CreateChatMenuButton
              icon={<Users size={18} />}
              onClick={() => onSelectKind("group")}
            >
              {ru.chats.createGroup}
            </CreateChatMenuButton>
            <CreateChatMenuButton
              icon={<Megaphone size={18} />}
              onClick={() => onSelectKind("channel")}
            >
              {ru.chats.createChannel}
            </CreateChatMenuButton>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={ru.chats.createChat}
        className="ios-button ml-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg shadow-black/20 transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        onClick={() => onOpenChange(!isOpen)}
        title={ru.chats.createChat}
        type="button"
      >
        <Plus size={compact ? 22 : 24} />
      </button>
    </div>
  );
}

function CreateChatMenuButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-11 w-full items-center gap-3 px-3 text-left text-sm text-[var(--text-main)] transition hover:bg-[var(--hover-soft)]"
      onClick={onClick}
      type="button"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--text-muted)]">
        {icon}
      </span>
      {children}
    </button>
  );
}

function ForwardMessageModal({
  chats,
  currentChatId,
  isForwarding,
  message,
  onClose,
  onConfirm,
  onQueryChange,
  onToggleChat,
  query,
  selectedChatIds,
}: {
  chats: Chat[];
  currentChatId: string | null;
  isForwarding: boolean;
  message: Message;
  onClose: () => void;
  onConfirm: () => void;
  onQueryChange: (value: string) => void;
  onToggleChat: (chatId: string) => void;
  query: string;
  selectedChatIds: string[];
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleChats = chats.filter((chat) =>
    getChatTitle(chat).toLowerCase().includes(normalizedQuery),
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end bg-black/38 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-10 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
    >
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="ios-glass flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-[28px] md:max-w-lg"
        exit={{ opacity: 0, scale: 0.98, y: 16 }}
        initial={{ opacity: 0, scale: 0.98, y: 16 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--accent)]">
            <Forward size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-[var(--text-main)]">
              {ru.chats.forwardTo}
            </h2>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {formatMessagePreview(message)}
            </p>
          </div>
          <button
            aria-label={ru.app.close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            disabled={isForwarding}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="border-b border-[var(--border-soft)] p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)]"
              size={18}
            />
            <input
              className="ios-input h-11 w-full pl-10 pr-4 text-[15px] placeholder:text-[var(--text-soft)]"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={ru.chats.chooseChat}
              value={query}
            />
          </div>
        </div>

        <div className="ios-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {visibleChats.map((chat) => {
            const canPost = canPostInChat(chat);
            const isSelected = selectedChatIds.includes(chat.id);
            const disabledReason = canPost ? null : ru.chats.errors.noPermissionToPostHere;

            return (
              <button
                className={`flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition ${
                  isSelected ? "bg-[var(--active-soft)]" : "hover:bg-[var(--hover-soft)]"
                } disabled:cursor-not-allowed disabled:opacity-55`}
                disabled={!canPost || isForwarding}
                key={chat.id}
                onClick={() => onToggleChat(chat.id)}
                title={disabledReason ?? getChatTitle(chat)}
                type="button"
              >
                <Avatar
                  avatarUrl={
                    chat.type === "private"
                      ? chat.partner?.avatarUrl ?? null
                      : chat.avatarUrl
                  }
                  label={getChatTitle(chat)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-[var(--text-main)]">
                      {getChatTitle(chat)}
                    </span>
                    {chat.id === currentChatId ? (
                      <span className="shrink-0 rounded-full bg-[var(--input-bg)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                        {ru.chats.message}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    {disabledReason ?? getChatSubtitle(chat)}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border-soft)]"
                  }`}
                >
                  {isSelected ? <Check size={15} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center gap-2 border-t border-[var(--border-soft)] p-4">
          <button
            className="ios-button h-11 flex-1 rounded-[16px] border border-[var(--border-soft)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--hover-soft)]"
            disabled={isForwarding}
            onClick={onClose}
            type="button"
          >
            {ru.app.cancel}
          </button>
          <button
            className="ios-button h-11 flex-1 rounded-[16px] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedChatIds.length || isForwarding}
            onClick={onConfirm}
            type="button"
          >
            {isForwarding ? ru.chats.sending : ru.chats.forward}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function SharedChatModal({
  error,
  isCreating,
  isSearching,
  kind,
  onClose,
  onCreate,
  onQueryChange,
  onTitleChange,
  onToggleMember,
  query,
  results,
  selectedMembers,
  title,
}: {
  error: string | null;
  isCreating: boolean;
  isSearching: boolean;
  kind: SharedChatKind;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onQueryChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onToggleMember: (user: AuthUser) => void;
  query: string;
  results: AuthUser[];
  selectedMembers: AuthUser[];
  title: string;
}) {
  const isGroup = kind === "group";
  const selectedIds = new Set(selectedMembers.map((member) => member.id));
  const canCreate = title.trim().length > 0 && selectedMembers.length > 0;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-end bg-black/38 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-10 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
    >
      <motion.form
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="ios-glass max-h-[88dvh] w-full overflow-hidden rounded-[28px] md:max-w-lg"
        exit={{ opacity: 0, scale: 0.98, y: 16 }}
        initial={{ opacity: 0, scale: 0.98, y: 16 }}
        onSubmit={onCreate}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <header className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--input-bg)] text-[var(--accent)]">
            {isGroup ? <Users size={20} /> : <Megaphone size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold text-[var(--text-main)]">
              {isGroup ? ru.chats.newGroup : ru.chats.newChannel}
            </h2>
            <p className="truncate text-sm text-[var(--text-muted)]">
              {isGroup ? ru.chats.groupCreationHint : ru.chats.channelCreationHint}
            </p>
          </div>
          <button
            aria-label={ru.app.close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="max-h-[calc(88dvh-8rem)] overflow-y-auto px-4 py-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text-main)]">
              {ru.chats.sharedChatTitle}
            </span>
            <input
              className="ios-input h-11 w-full px-4 text-[15px] placeholder:text-[var(--text-soft)]"
              disabled={isCreating}
              maxLength={80}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={isGroup ? ru.chats.groupTitlePlaceholder : ru.chats.channelTitlePlaceholder}
              value={title}
            />
          </label>

          {selectedMembers.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedMembers.map((member) => (
                <button
                  className="flex h-8 max-w-full items-center gap-2 rounded-full bg-[var(--active-soft)] px-2.5 text-sm text-[var(--text-main)] transition hover:bg-[var(--hover-soft)]"
                  disabled={isCreating}
                  key={member.id}
                  onClick={() => onToggleMember(member)}
                  type="button"
                >
                  <span className="truncate">{getUserDisplayName(member)}</span>
                  <X size={14} />
                </button>
              ))}
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text-main)]">
              {ru.chats.addMembers}
            </span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-soft)]"
                size={18}
              />
              <input
                className="ios-input h-11 w-full pl-10 pr-4 text-[15px] placeholder:text-[var(--text-soft)]"
                disabled={isCreating}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={ru.chats.searchUsers}
                type="search"
                value={query}
              />
            </span>
          </label>

          <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border-soft)]">
            {isSearching ? (
              <ChatListSkeleton compact={false} rows={3} />
            ) : query.trim() && !results.length ? (
              <StateMessage>{ru.chats.noUsersFound}</StateMessage>
            ) : (
              <ul className="max-h-64 divide-y divide-[var(--border-soft)] overflow-y-auto">
                {results.map((user) => {
                  const isSelected = selectedIds.has(user.id);

                  return (
                    <li key={user.id}>
                      <button
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-[var(--hover-soft)]"
                        disabled={isCreating}
                        onClick={() => onToggleMember(user)}
                        type="button"
                      >
                        <Avatar
                          avatarUrl={user.avatarUrl}
                          label={getUserDisplayName(user)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-[var(--text-main)]">
                            {getUserDisplayName(user)}
                          </span>
                          <span className="block truncate text-sm text-[var(--text-muted)]">
                            @{user.username}
                          </span>
                        </span>
                        {isSelected ? (
                          <Check className="text-[var(--accent)]" size={18} />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {!query.trim() ? (
                  <StateMessage>{ru.chats.searchUsersHint}</StateMessage>
                ) : null}
              </ul>
            )}
          </div>

          {error ? (
            <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-soft)] px-4 py-3">
          <button
            className="h-10 rounded-md px-4 text-[15px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            {ru.chats.cancel}
          </button>
          <button
            className="ios-button h-10 rounded-full bg-[var(--accent)] px-4 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating || !canCreate}
            type="submit"
          >
            {isCreating ? ru.chats.creating : ru.chats.create}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function ChatList({
  chats,
  compact,
  groupInvites,
  isLoading,
  messagePreviewEnabled,
  onRespondToInvite,
  onSelectChat,
  pendingInviteId,
  selectedChatId,
}: {
  chats: Chat[];
  compact: boolean;
  groupInvites: GroupInvite[];
  isLoading: boolean;
  messagePreviewEnabled: boolean;
  onRespondToInvite: (
    invite: GroupInvite,
    status: "accepted" | "declined",
  ) => void;
  onSelectChat: (chat: Chat) => void;
  pendingInviteId: string | null;
  selectedChatId: string | null;
}) {
  if (isLoading) {
    return <ChatListSkeleton compact={compact} />;
  }

  if (!chats.length && !groupInvites.length) {
    return <EmptyChatsState compact={compact} />;
  }

  return (
    <ul className="py-1">
      {groupInvites.map((invite) => (
        <li key={invite.id}>
          <InviteListItem
            compact={compact}
            invite={invite}
            isPending={pendingInviteId === invite.id}
            onRespond={onRespondToInvite}
          />
        </li>
      ))}
      {chats.map((chat) => (
        <li key={chat.id}>
          <button
            className={`mx-2 flex w-[calc(100%-1rem)] items-center rounded-[18px] px-3 py-2.5 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${
              selectedChatId === chat.id
                ? "bg-[var(--active-soft)]"
                : "hover:bg-[var(--hover-soft)]"
            } ${compact ? "justify-center px-3" : "gap-3"}`}
            onClick={() => onSelectChat(chat)}
            type="button"
            title={getChatTitle(chat)}
          >
            <Avatar
              avatarUrl={
                chat.type === "private"
                  ? chat.partner?.avatarUrl ?? null
                  : chat.avatarUrl
              }
              label={getChatTitle(chat)}
            />
            <div className={`min-w-0 ${compact ? "hidden" : "block"}`}>
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--text-main)]">
                  {getChatTitle(chat)}
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

function EmptyChatsState({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="flex justify-center px-3 py-5">
        <LinkaIcon size={44} />
      </div>
    );
  }

  return (
    <div className="px-4 py-8 text-center">
      <LinkaIcon className="mx-auto" size={52} />
      <p className="mt-4 text-sm font-medium text-[var(--text-main)]">
        {ru.chats.noChats}
      </p>
      <RandomEmptyGif className="mt-4" />
    </div>
  );
}

function EmptyChatThreadState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="px-4">
      <RandomEmptyGif />
      <h1 className="mt-4 text-xl font-semibold text-[var(--text-main)] md:text-2xl">
        {title}
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        {description}
      </p>
    </div>
  );
}

function RandomEmptyGif({ className = "" }: { className?: string }) {
  const [activeGifIndex, setActiveGifIndex] = useState<number | null>(null);
  const gif =
    activeGifIndex === null ? null : EMPTY_CHAT_GIFS[activeGifIndex];

  useEffect(() => {
    setActiveGifIndex(Math.floor(Math.random() * EMPTY_CHAT_GIFS.length));
  }, []);

  if (!gif) {
    return null;
  }

  return (
    <div className={className}>
      <div
        className="mx-auto w-full max-w-[280px] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-xl shadow-black/10"
        style={{ aspectRatio: gif.aspectRatio }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="h-full w-full"
          loading="lazy"
          src={gif.src}
          draggable={false}
        />
      </div>
    </div>
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

function InviteListItem({
  compact,
  invite,
  isPending,
  onRespond,
}: {
  compact: boolean;
  invite: GroupInvite;
  isPending: boolean;
  onRespond: (invite: GroupInvite, status: "accepted" | "declined") => void;
}) {
  return (
    <div
      className={`px-4 py-3 ${compact ? "flex justify-center px-3" : ""}`}
      title={ru.chats.officialInvite}
    >
      {compact ? (
        <LinkaIcon size={44} />
      ) : (
        <div className="flex gap-3">
          <LinkaIcon size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-[var(--text-main)]">
              {ru.chats.officialInvite}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              {ru.chats.inviteToGroup(
                invite.chat.title ?? ru.chats.group,
                getUserDisplayName(invite.inviter),
              )}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
                disabled={isPending}
                onClick={() => onRespond(invite, "accepted")}
                type="button"
              >
                {ru.chats.accept}
              </button>
              <button
                className="h-8 rounded-md px-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)] disabled:opacity-60"
                disabled={isPending}
                onClick={() => onRespond(invite, "declined")}
                type="button"
              >
                {ru.chats.decline}
              </button>
            </div>
          </div>
        </div>
      )}
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
  deletingMessageId,
  hasOlderMessages,
  isGroupSettingsOpen,
  isLoadingMessages,
  isLoadingOlderMessages,
  isMobile,
  isRecordingVoice,
  isSavingGroupSettings,
  isSending,
  isSendingVoice,
  isUploadingMedia,
  messageError,
  messageNotice,
  messageText,
  messages,
  messagesScrollRef,
  messagesEndRef,
  recordingDuration,
  onAddGroupMembers,
  onBackToChats,
  onCloseGroupSettings,
  onCancelReply,
  onDeleteMessage,
  onForwardMessage,
  onGroupAvatarChange,
  onGroupWallpaperChange,
  onLoadOlderMessages,
  onMentionAll,
  onMediaChange,
  onOpenProfile,
  onOpenGroupSettings,
  onReplyPreviewClick,
  onReplyToMessage,
  onMessageTextChange,
  onSaveGroupTitle,
  onSendMessage,
  onToggleReaction,
  onUpdateGroupRole,
  onVoiceClick,
  onVoicePointerCancel,
  onVoicePointerDown,
  onVoicePointerUp,
  selectedChat,
  selectedReplyMessage,
  typingUsers,
}: {
  currentUserId: string | null;
  deletingMessageId: string | null;
  hasOlderMessages: boolean;
  isGroupSettingsOpen: boolean;
  isLoadingMessages: boolean;
  isLoadingOlderMessages: boolean;
  isMobile: boolean;
  isRecordingVoice: boolean;
  isSavingGroupSettings: boolean;
  isSending: boolean;
  isSendingVoice: boolean;
  isUploadingMedia: boolean;
  messageError: string | null;
  messageNotice: string | null;
  messageText: string;
  messages: Message[];
  messagesScrollRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  recordingDuration: number;
  onAddGroupMembers: (memberIds: string[]) => void;
  onBackToChats: () => void;
  onCancelReply: () => void;
  onCloseGroupSettings: () => void;
  onDeleteMessage: (message: Message) => void;
  onForwardMessage: (message: Message) => void;
  onGroupAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onGroupWallpaperChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadOlderMessages: () => void;
  onMentionAll: () => void;
  onMediaChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenProfile: (username: string) => void;
  onOpenGroupSettings: () => void;
  onReplyPreviewClick: (preview: MessagePreview) => void;
  onReplyToMessage: (message: Message) => void;
  onMessageTextChange: (value: string) => void;
  onSaveGroupTitle: (title: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onUpdateGroupRole: (
    userId: string,
    role: "admin" | "member" | "subscriber",
  ) => void;
  onVoiceClick: () => void;
  onVoicePointerCancel: () => void;
  onVoicePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onVoicePointerUp: () => void;
  selectedChat: Chat | null;
  selectedReplyMessage: Message | null;
  typingUsers: TypingUser[];
}) {
  const typingText = getTypingText(typingUsers);
  const canPost = canPostInChat(selectedChat);
  const canManageChat = canManageSelectedChat(selectedChat);
  const canModerateMessages =
    selectedChat?.type === "group" && canManageChat;
  const isChatOwner =
    (selectedChat?.type === "group" || selectedChat?.type === "channel") &&
    selectedChat.currentUserRole === "owner";
  const settingsLabel = selectedChat
    ? getChatSettingsLabel(selectedChat)
    : ru.chats.groupSettings;

  return (
    <motion.section
      className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-bg)] lg:flex ${
        selectedChat ? "flex" : "hidden"
      }`}
      initial={false}
    >
      {selectedChat ? (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="flex h-full min-h-0 flex-col"
          initial={isMobile ? { opacity: 0.96, x: 32 } : { opacity: 1, x: 0 }}
          key={selectedChat.id}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="flex h-[64px] shrink-0 items-center gap-3 border-b border-[var(--border-soft)] bg-[var(--panel-floating)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:h-[73px] lg:px-5 lg:pt-0">
            <button
              aria-label={ru.chats.backToChats}
              className="ios-button flex h-10 shrink-0 items-center gap-0 rounded-full px-1 pr-2 text-[15px] font-medium text-[var(--accent)] transition hover:bg-[var(--hover-soft)] lg:hidden"
              onClick={onBackToChats}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={24} />
              <span>{ru.chats.back}</span>
            </button>
            <button
              className="flex min-w-0 items-center gap-3 rounded-full pr-3 text-left transition hover:bg-[var(--hover-soft)]"
              onClick={() => {
                if (selectedChat.partner) {
                  onOpenProfile(selectedChat.partner.username);
                }
              }}
              title={getChatTitle(selectedChat)}
              type="button"
            >
              <Avatar
                avatarUrl={
                  selectedChat.type === "private"
                    ? selectedChat.partner?.avatarUrl ?? null
                    : selectedChat.avatarUrl
                }
                label={getChatTitle(selectedChat)}
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">
                  {getChatTitle(selectedChat)}
                </p>
                <p className="truncate text-sm text-[var(--text-muted)]">
                  {typingText ?? getChatSubtitle(selectedChat)}
                </p>
              </div>
            </button>
            {canManageChat ? (
              <button
                aria-label={settingsLabel}
                className="ios-button ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
                onClick={onOpenGroupSettings}
                title={settingsLabel}
                type="button"
              >
                <Settings size={20} />
              </button>
            ) : null}
          </header>

          <div
            className="ios-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-cover bg-center px-3 py-4 md:px-5 md:py-5"
            ref={messagesScrollRef}
            style={
              selectedChat.wallpaperUrl
                ? { backgroundImage: `url(${resolveUploadUrl(selectedChat.wallpaperUrl)})` }
                : undefined
            }
          >
            {isLoadingMessages ? (
              <MessageSkeleton />
            ) : messages.length ? (
              <div className="space-y-1.5">
                {hasOlderMessages ? (
                  <div className="flex justify-center pb-3">
                    <button
                      className="ios-button h-9 rounded-full border border-[var(--border-soft)] bg-[var(--panel-floating)] px-4 text-sm font-semibold text-[var(--accent)] shadow-sm backdrop-blur transition hover:bg-[var(--hover-soft)] disabled:cursor-wait disabled:opacity-60"
                      disabled={isLoadingOlderMessages}
                      onClick={onLoadOlderMessages}
                      type="button"
                    >
                      {isLoadingOlderMessages
                        ? ru.chats.loadingOlderMessages
                        : ru.chats.loadOlderMessages}
                    </button>
                  </div>
                ) : null}
                <AnimatePresence initial={false}>
                  {messages.map((message, index) => {
                    const previousMessage = messages[index - 1];
                    const showDateSeparator =
                      !previousMessage ||
                      !isSameMessageDay(previousMessage.createdAt, message.createdAt);

                    return (
                      <motion.div
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        id={`message-${message.id}`}
                        initial={{ opacity: 0, y: 8, scale: 0.99 }}
                        key={message.id}
                        layout
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        {showDateSeparator ? (
                          <DateSeparator value={message.createdAt} />
                        ) : null}
                        <MessageBubble
                          canDelete={
                            message.senderId === currentUserId || canModerateMessages
                          }
                          chatType={selectedChat.type}
                          deletingMessageId={deletingMessageId}
                          isOwn={message.senderId === currentUserId}
                          isMobile={isMobile}
                          message={message}
                          onDelete={onDeleteMessage}
                          onForward={onForwardMessage}
                          onOpenProfile={onOpenProfile}
                          onReply={onReplyToMessage}
                          onReplyPreviewClick={onReplyPreviewClick}
                          onToggleReaction={onToggleReaction}
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
                  <EmptyChatThreadState
                    description={ru.chats.firstMessageHint}
                    title={getEmptyChatTitle(selectedChat)}
                  />
                  <div ref={messagesEndRef} />
                </motion.div>
              </div>
            )}
          </div>

          {canPost ? (
            <form
              className="shrink-0 border-t border-[var(--border-soft)] bg-[var(--panel-floating)] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:px-4"
              onSubmit={onSendMessage}
            >
              {messageError ? (
                <p className="mb-2 text-sm text-[var(--danger)]">{messageError}</p>
              ) : null}
              {messageNotice ? (
                <p className="mb-2 text-sm text-[var(--text-muted)]">
                  {messageNotice}
                </p>
              ) : null}
              {isUploadingMedia || isSendingVoice ? (
                <p className="mb-2 text-sm text-[var(--text-muted)]">{ru.chats.uploading}</p>
              ) : null}
              {selectedReplyMessage ? (
                <ComposerReplyPreview
                  message={selectedReplyMessage}
                  onCancel={onCancelReply}
                />
              ) : null}
              <div className="flex min-w-0 items-end gap-2 md:gap-3">
                <label
                  className={`ios-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-soft)] bg-[var(--input-bg)] text-xl font-semibold text-[var(--accent)] transition hover:bg-[var(--hover-soft)] ${
                    isUploadingMedia ? "cursor-wait opacity-60" : "cursor-pointer"
                  }`}
                  title={ru.chats.attachFile}
                >
                  <input
                    accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/webm,application/pdf"
                    className="sr-only"
                    disabled={isUploadingMedia || isSendingVoice || isRecordingVoice}
                    onChange={onMediaChange}
                    type="file"
                  />
                  <Plus aria-hidden="true" size={23} />
                </label>
                {isRecordingVoice ? (
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[22px] border border-[var(--accent)]/30 bg-[var(--active-soft)] px-4 text-[15px] text-[var(--text-main)]">
                    <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--danger)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {ru.chats.recordingVoice}
                    </span>
                    <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">
                      {formatVoiceDuration(recordingDuration)}
                    </span>
                  </div>
                ) : (
                  <textarea
                    className="ios-input max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] px-4 py-3 text-[15px] placeholder:text-[var(--text-soft)]"
                    disabled={isSendingVoice}
                    onChange={(event) => onMessageTextChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={
                      selectedChat.type === "channel"
                        ? ru.chats.postPlaceholder
                        : ru.chats.messagePlaceholder
                    }
                    value={messageText}
                  />
                )}
                <button
                  aria-label={ru.chats.recordVoice}
                  className={`ios-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isRecordingVoice
                      ? "border-[var(--danger)] bg-red-500/10 text-[var(--danger)]"
                      : "border-[var(--border-soft)] bg-[var(--input-bg)] text-[var(--accent)] hover:bg-[var(--hover-soft)]"
                  }`}
                  disabled={isUploadingMedia || isSendingVoice || isSending}
                  onClick={onVoiceClick}
                  onPointerCancel={onVoicePointerCancel}
                  onPointerDown={onVoicePointerDown}
                  onPointerUp={onVoicePointerUp}
                  title={
                    isRecordingVoice
                      ? ru.chats.tapToSendVoice
                      : ru.chats.recordVoice
                  }
                  type="button"
                >
                  <Mic size={20} />
                </button>
                <button
                  aria-label={ru.chats.send}
                  className="ios-button flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-full bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:px-4"
                  disabled={
                    isSending ||
                    isUploadingMedia ||
                    isSendingVoice ||
                    isRecordingVoice ||
                    !messageText.trim()
                  }
                  type="submit"
                >
                  <SendHorizontal className="md:hidden" size={19} />
                  <span className="hidden md:inline">{isSending ? ru.chats.sending : ru.chats.send}</span>
                </button>
                {canModerateMessages ? (
                  <button
                    className="ios-button h-11 shrink-0 rounded-full border border-[var(--border-soft)] px-3 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--hover-soft)]"
                    onClick={onMentionAll}
                    type="button"
                  >
                    @all
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="shrink-0 border-t border-[var(--border-soft)] bg-[var(--panel-floating)] px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-sm text-[var(--text-muted)] backdrop-blur-xl">
              {ru.chats.channelReadOnly}
            </div>
          )}
        </motion.div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <LinkaIcon className="mx-auto mb-5" size={64} />
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              {ru.chats.chooseChat}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              {ru.chats.chooseChatHint}
            </p>
            <RandomEmptyGif className="mt-5" />
          </div>
        </div>
      )}
      <AnimatePresence>
        {selectedChat && isGroupSettingsOpen ? (
          <SharedChatSettingsPanel
            chat={selectedChat}
            isOwner={isChatOwner}
            isSaving={isSavingGroupSettings}
            onAddMembers={onAddGroupMembers}
            onAvatarChange={onGroupAvatarChange}
            onClose={onCloseGroupSettings}
            onOpenProfile={onOpenProfile}
            onSaveTitle={onSaveGroupTitle}
            onUpdateRole={onUpdateGroupRole}
            onWallpaperChange={onGroupWallpaperChange}
          />
        ) : null}
      </AnimatePresence>
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

function SharedChatSettingsPanel({
  chat,
  isOwner,
  isSaving,
  onAddMembers,
  onAvatarChange,
  onClose,
  onOpenProfile,
  onSaveTitle,
  onUpdateRole,
  onWallpaperChange,
}: {
  chat: Chat;
  isOwner: boolean;
  isSaving: boolean;
  onAddMembers: (memberIds: string[]) => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onOpenProfile: (username: string) => void;
  onSaveTitle: (title: string) => void;
  onUpdateRole: (
    userId: string,
    role: "admin" | "member" | "subscriber",
  ) => void;
  onWallpaperChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [title, setTitle] = useState(chat.title ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<AuthUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [subscribers, setSubscribers] = useState<ChannelSubscriber[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [subscribersError, setSubscribersError] = useState<string | null>(null);
  const isChannel = chat.type === "channel";

  useEffect(() => {
    setTitle(chat.title ?? "");
  }, [chat.title]);

  useEffect(() => {
    if (!isChannel) {
      setSubscribers([]);
      setSubscribersError(null);
      setIsLoadingSubscribers(false);
      return;
    }

    let isActive = true;
    setIsLoadingSubscribers(true);
    setSubscribersError(null);

    getSubscribers(chat.id)
      .then((items) => {
        if (isActive) {
          setSubscribers(items);
        }
      })
      .catch(() => {
        if (isActive) {
          setSubscribers([]);
          setSubscribersError(ru.chats.errors.loadSubscribers);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingSubscribers(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [chat.id, chat.memberCount, isChannel]);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const users = await searchUsers(normalizedQuery);
        const existingIds = new Set(chat.members.map((member) => member.user.id));
        const selectedIds = new Set(selectedUsers.map((user) => user.id));

        if (isActive) {
          setResults(
            users.filter(
              (user) => !existingIds.has(user.id) && !selectedIds.has(user.id),
            ),
          );
        }
      } catch {
        if (isActive) {
          setResults([]);
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
  }, [chat.members, query, selectedUsers]);

  function handleAddSelectedMembers() {
    if (!selectedUsers.length) {
      return;
    }

    onAddMembers(selectedUsers.map((user) => user.id));
    setSelectedUsers([]);
    setQuery("");
    setResults([]);
  }

  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      className="ios-glass absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[var(--border-soft)]"
      exit={{ opacity: 0, x: 32 }}
      initial={{ opacity: 0, x: 32 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <header className="flex h-[64px] items-center gap-3 border-b border-[var(--border-soft)] px-4">
        <ShieldCheck className="text-[var(--accent)]" size={21} />
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">
          {getChatSettingsLabel(chat)}
        </h2>
        <button
          aria-label={ru.app.close}
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
          onClick={onClose}
          type="button"
        >
          <X size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
              {ru.chats.sharedChatTitle}
            </span>
            <input
              className="ios-input h-11 w-full px-4 text-[15px]"
              disabled={isSaving}
              maxLength={80}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <button
            className="ios-button h-10 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            disabled={isSaving || !title.trim() || title.trim() === (chat.title ?? "")}
            onClick={() => onSaveTitle(title)}
            type="button"
          >
            {ru.chats.save}
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] text-sm font-medium text-[var(--text-main)] transition hover:bg-[var(--hover-soft)]">
            <Camera size={17} />
            {isChannel ? ru.chats.channelAvatar : ru.chats.groupAvatar}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isSaving}
              onChange={onAvatarChange}
              type="file"
            />
          </label>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--input-bg)] text-sm font-medium text-[var(--text-main)] transition hover:bg-[var(--hover-soft)]">
            <Image size={17} />
            {ru.chats.chatWallpaper}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isSaving}
              onChange={onWallpaperChange}
              type="file"
            />
          </label>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-main)]">
            {ru.chats.addMembers}
          </h3>
          <input
          className="ios-input h-10 w-full px-3 text-sm"
            disabled={isSaving}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ru.chats.searchUsers}
            type="search"
            value={query}
          />
          {selectedUsers.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <button
                  className="rounded-full bg-[var(--active-soft)] px-2.5 py-1 text-sm"
                  key={user.id}
                  onClick={() =>
                    setSelectedUsers((current) =>
                      current.filter((item) => item.id !== user.id),
                    )
                  }
                  type="button"
                >
                  {getUserDisplayName(user)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-[var(--border-soft)]">
            {isSearching ? (
              <StateMessage>{ru.chats.searching}</StateMessage>
            ) : results.length ? (
              results.map((user) => (
                <button
                  className="flex w-full items-center gap-3 border-b border-[var(--border-soft)] px-3 py-2 text-left transition last:border-b-0 hover:bg-[var(--hover-soft)]"
                  key={user.id}
                  onClick={() => setSelectedUsers((current) => [...current, user])}
                  type="button"
                >
                  <Avatar avatarUrl={user.avatarUrl} label={getUserDisplayName(user)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {getUserDisplayName(user)}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      @{user.username}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <StateMessage>{ru.chats.searchUsersHint}</StateMessage>
            )}
          </div>
          <button
            className="ios-button mt-2 h-10 w-full rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
            disabled={isSaving || !selectedUsers.length}
            onClick={handleAddSelectedMembers}
            type="button"
          >
            {ru.chats.addMembers}
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-main)]">
            {ru.chats.members}
          </h3>
          <div className="divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border-soft)]">
            {chat.members.map((member) => {
              const canToggleRole =
                isOwner &&
                (isChannel
                  ? member.role !== "owner"
                  : !["owner", "subscriber"].includes(member.role));
              const nextRole = isChannel
                ? member.role === "admin"
                  ? "subscriber"
                  : "admin"
                : member.role === "admin"
                  ? "member"
                  : "admin";

              return (
                <div className="flex items-center gap-3 px-3 py-2" key={member.user.id}>
                  <button
                    className="shrink-0"
                    onClick={() => onOpenProfile(member.user.username)}
                    type="button"
                  >
                    <Avatar
                      avatarUrl={member.user.avatarUrl}
                      label={getUserDisplayName(member.user)}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {getUserDisplayName(member.user)}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      @{member.user.username} · {getRoleLabel(member.role)}
                    </p>
                  </div>
                  {canToggleRole ? (
                    <button
                      className="h-8 rounded-md px-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--hover-soft)]"
                      disabled={isSaving}
                      onClick={() =>
                        onUpdateRole(member.user.id, nextRole)
                      }
                      type="button"
                    >
                      {member.role === "admin"
                        ? ru.chats.removeAdmin
                        : ru.chats.makeAdmin}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {isChannel ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-main)]">
              {ru.chats.channelSubscribers}
            </h3>
            <div className="divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border-soft)]">
              {isLoadingSubscribers ? (
                <StateMessage>{ru.chats.loadingSubscribers}</StateMessage>
              ) : subscribersError ? (
                <StateMessage tone="error">{subscribersError}</StateMessage>
              ) : subscribers.length ? (
                subscribers.map((subscriber) => (
                  <div
                    className="flex items-center gap-3 px-3 py-2"
                    key={subscriber.user.id}
                  >
                    <button
                      className="shrink-0"
                      onClick={() => onOpenProfile(subscriber.user.username)}
                      type="button"
                    >
                      <Avatar
                        avatarUrl={subscriber.user.avatarUrl}
                        label={getUserDisplayName(subscriber.user)}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {getUserDisplayName(subscriber.user)}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        @{subscriber.user.username} ·{" "}
                        {formatJoinedAt(subscriber.joinedAt)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <StateMessage>{ru.chats.noSubscribers}</StateMessage>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </motion.aside>
  );
}

function DateSeparator({ value }: { value: string }) {
  return (
    <div className="sticky top-2 z-[1] my-3 flex justify-center">
      <span className="ios-glass rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
        {formatMessageDate(value)}
      </span>
    </div>
  );
}

function MessageBubble({
  canDelete,
  chatType,
  deletingMessageId,
  isOwn,
  isMobile,
  message,
  onDelete,
  onForward,
  onOpenProfile,
  onReply,
  onReplyPreviewClick,
  onToggleReaction,
}: {
  canDelete: boolean;
  chatType: ChatType;
  deletingMessageId: string | null;
  isOwn: boolean;
  isMobile: boolean;
  message: Message;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onOpenProfile: (username: string) => void;
  onReply: (message: Message) => void;
  onReplyPreviewClick: (preview: MessagePreview) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
}) {
  const showSender = !isOwn && chatType !== "private";
  const isDeleted = Boolean(message.deletedAt);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);

  function clearLongPress() {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    };
    clearLongPress();
    longPressTimeoutRef.current = window.setTimeout(() => {
      if (!isDeleted) {
        setIsReactionPickerOpen(true);
      }
    }, 520);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    clearLongPress();
    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (!start || isDeleted) {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = Math.abs(event.clientY - start.y);

    if (Math.abs(deltaX) > 64 && deltaY < 36) {
      onReply(message);
    }
  }

  function handleQuickReaction(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!isDeleted) {
      onToggleReaction(message, QUICK_MESSAGE_REACTION);
    }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    if (!isDeleted) {
      setIsReactionPickerOpen(true);
    }
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      {showSender ? (
        <button
          className="mr-2 mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--input-bg)] text-xs font-semibold text-[var(--accent)]"
          onClick={() => onOpenProfile(message.sender.username)}
          title={`@${message.sender.username}`}
          type="button"
        >
          {message.sender.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover"
              src={resolveUploadUrl(message.sender.avatarUrl)}
            />
          ) : (
            getUserDisplayName(message.sender).slice(0, 1).toUpperCase()
          )}
        </button>
      ) : null}
      <div
        className={`flex max-w-[86%] flex-col md:max-w-[68%] ${
          isOwn ? "items-end" : "items-start"
        }`}
      >
        <div className="group relative flex max-w-full items-end gap-1">
        {!isOwn ? (
          <MessageActionButton
            isOpen={isMenuOpen}
            setIsOpen={setIsMenuOpen}
          />
        ) : null}
        <div
          onPointerCancel={clearLongPress}
          onPointerDown={handlePointerDown}
          onPointerLeave={clearLongPress}
          onPointerUp={handlePointerUp}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleQuickReaction}
          className={`max-w-full px-3.5 py-2 text-[15px] leading-5 shadow-sm ${
            isOwn
              ? "rounded-[20px] rounded-br-[6px] bg-[var(--bubble-out)] text-[var(--bubble-out-text)]"
              : "rounded-[20px] rounded-bl-[6px] border border-[var(--border-soft)] bg-[var(--bubble-in)] text-[var(--text-main)]"
          }`}
        >
          {message.forwardedFrom ? (
            <ForwardedLabel message={message} isOwn={isOwn} />
          ) : null}
          {showSender ? (
            <button
              className="mb-1 block max-w-full truncate text-left text-xs font-semibold text-[var(--accent)]"
              onClick={() => onOpenProfile(message.sender.username)}
              type="button"
            >
              {getUserDisplayName(message.sender)}
            </button>
          ) : null}
          {message.replyTo ? (
            <ReplyPreviewCard
              isOwn={isOwn}
              onClick={() => onReplyPreviewClick(message.replyTo!)}
              preview={message.replyTo}
            />
          ) : null}
          {isDeleted ? (
            <p className="italic opacity-75">{ru.chats.messageDeleted}</p>
          ) : (
            <MessageMedia message={message} />
          )}
          {!isDeleted && message.text ? (
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
          <MessageMenu
            canDelete={canDelete}
            deletingMessageId={deletingMessageId}
            isDeleted={isDeleted}
            isOpen={isMenuOpen}
            message={message}
            onDelete={onDelete}
            onForward={onForward}
            onReact={() => setIsReactionPickerOpen(true)}
            onReply={onReply}
            setIsOpen={setIsMenuOpen}
          />
          <ReactionPicker
            isMobile={isMobile}
            isOpen={isReactionPickerOpen}
            isOwn={isOwn}
            message={message}
            onClose={() => setIsReactionPickerOpen(false)}
            onToggleReaction={onToggleReaction}
          />
        </div>
        {isOwn ? (
          <MessageActionButton
            isOpen={isMenuOpen}
            setIsOpen={setIsMenuOpen}
          />
        ) : null}
        </div>
        <MessageReactionChips
          message={message}
          onToggleReaction={onToggleReaction}
        />
      </div>
    </div>
  );
}

function MessageActionButton({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  return (
    <button
      aria-label={ru.chats.messageActions}
      className={`ios-button mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--panel-floating)] text-[var(--text-muted)] shadow-sm backdrop-blur transition md:opacity-0 md:group-hover:opacity-100 ${
        isOpen ? "opacity-100" : ""
      }`}
      onClick={() => setIsOpen(!isOpen)}
      title={ru.chats.messageActions}
      type="button"
    >
      <MoreHorizontal size={17} />
    </button>
  );
}

function MessageMenu({
  canDelete,
  deletingMessageId,
  isDeleted,
  isOpen,
  message,
  onDelete,
  onForward,
  onReact,
  onReply,
  setIsOpen,
}: {
  canDelete: boolean;
  deletingMessageId: string | null;
  isDeleted: boolean;
  isOpen: boolean;
  message: Message;
  onDelete: (message: Message) => void;
  onForward: (message: Message) => void;
  onReact: () => void;
  onReply: (message: Message) => void;
  setIsOpen: (isOpen: boolean) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 min-w-40 overflow-hidden rounded-[18px] border border-[var(--border-soft)] bg-[var(--panel-floating)]/95 p-1 text-[var(--text-main)] shadow-xl backdrop-blur-xl">
      <button
        className="flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-sm font-medium transition hover:bg-[var(--hover-soft)] disabled:opacity-45"
        disabled={isDeleted}
        onClick={() => {
          setIsOpen(false);
          onReact();
        }}
        type="button"
      >
        <span className="text-base leading-none">{QUICK_MESSAGE_REACTION}</span>
        {ru.chats.react}
      </button>
      <button
        className="flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-sm font-medium transition hover:bg-[var(--hover-soft)] disabled:opacity-45"
        disabled={isDeleted}
        onClick={() => {
          setIsOpen(false);
          onReply(message);
        }}
        type="button"
      >
        <Reply size={16} />
        {ru.chats.reply}
      </button>
      <button
        className="flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-sm font-medium transition hover:bg-[var(--hover-soft)] disabled:opacity-45"
        disabled={isDeleted}
        onClick={() => {
          setIsOpen(false);
          onForward(message);
        }}
        type="button"
      >
        <Forward size={16} />
        {ru.chats.forward}
      </button>
      {canDelete ? (
        <button
          className="flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-sm font-medium text-[var(--danger)] transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-45"
          disabled={isDeleted || deletingMessageId === message.id}
          onClick={() => {
            setIsOpen(false);
            onDelete(message);
          }}
          type="button"
        >
          <Trash2 size={16} />
          {ru.chats.deleteMessage}
        </button>
      ) : null}
    </div>
  );
}

function ReactionPicker({
  isMobile,
  isOpen,
  isOwn,
  message,
  onClose,
  onToggleReaction,
}: {
  isMobile: boolean;
  isOpen: boolean;
  isOwn: boolean;
  message: Message;
  onClose: () => void;
  onToggleReaction: (message: Message, emoji: string) => void;
}) {
  const reactedEmoji = new Set(
    (message.reactions ?? [])
      .filter((reaction) => reaction.reactedByMe)
      .map((reaction) => reaction.emoji),
  );

  return (
    <AnimatePresence>
      {isOpen ? (
        isMobile ? (
          <>
            <motion.button
              aria-label={ru.app.close}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[80] bg-black/25 backdrop-blur-[1px]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={onClose}
              type="button"
            />
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="ios-glass fixed inset-x-3 bottom-[calc(0.85rem+env(safe-area-inset-bottom))] z-[81] rounded-[24px] p-3"
              exit={{ opacity: 0, y: 18 }}
              initial={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <ReactionPickerContent
                reactedEmoji={reactedEmoji}
                message={message}
                onClose={onClose}
                onToggleReaction={onToggleReaction}
              />
            </motion.div>
          </>
        ) : (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`ios-glass absolute bottom-full z-30 mb-2 rounded-[22px] p-2 ${
              isOwn ? "right-0" : "left-0"
            }`}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <ReactionPickerContent
              reactedEmoji={reactedEmoji}
              message={message}
              onClose={onClose}
              onToggleReaction={onToggleReaction}
            />
          </motion.div>
        )
      ) : null}
    </AnimatePresence>
  );
}

function ReactionPickerContent({
  reactedEmoji,
  message,
  onClose,
  onToggleReaction,
}: {
  reactedEmoji: Set<string>;
  message: Message;
  onClose: () => void;
  onToggleReaction: (message: Message, emoji: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {ru.chats.reactions}
        </p>
        <button
          aria-label={ru.app.close}
          className="ios-button flex h-7 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)]"
          onClick={onClose}
          type="button"
        >
          <X size={15} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {SUPPORTED_MESSAGE_REACTIONS.map((emoji) => {
          const isActive = reactedEmoji.has(emoji);

          return (
            <button
              aria-label={isActive ? ru.chats.removeReaction : ru.chats.react}
              className={`ios-button flex h-11 w-11 items-center justify-center rounded-full text-[23px] transition ${
                isActive
                  ? "bg-[var(--accent)]/18 shadow-[inset_0_0_0_1px_var(--accent)]"
                  : "bg-[var(--input-bg)] hover:bg-[var(--hover-soft)]"
              }`}
              key={emoji}
              onClick={() => {
                onToggleReaction(message, emoji);
                onClose();
              }}
              title={isActive ? ru.chats.removeReaction : ru.chats.react}
              type="button"
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MessageReactionChips({
  message,
  onToggleReaction,
}: {
  message: Message;
  onToggleReaction: (message: Message, emoji: string) => void;
}) {
  const reactions = message.reactions ?? [];

  if (!reactions.length || message.deletedAt) {
    return null;
  }

  return (
    <div className="mt-1 flex max-w-full flex-wrap gap-1.5 px-1">
      {reactions.map((reaction) => (
        <button
          className={`ios-button flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-semibold shadow-sm transition ${
            reaction.reactedByMe
              ? "border-[var(--accent)]/35 bg-[var(--accent)]/16 text-[var(--accent)]"
              : "border-[var(--border-soft)] bg-[var(--panel-floating)]/85 text-[var(--text-main)] hover:bg-[var(--hover-soft)]"
          }`}
          key={reaction.emoji}
          onClick={() => onToggleReaction(message, reaction.emoji)}
          title={formatReactionUsersPreview(reaction)}
          type="button"
        >
          <span className="text-sm leading-none">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

function ForwardedLabel({
  isOwn,
  message,
}: {
  isOwn: boolean;
  message: Message;
}) {
  if (!message.forwardedFrom) {
    return null;
  }

  const senderName = getUserDisplayName(message.forwardedFrom.sender);
  const label = message.forwardedFrom.chatTitle
    ? `${ru.chats.forwardedMessage} - ${message.forwardedFrom.chatTitle}`
    : ru.chats.forwardedMessage;

  return (
    <div
      className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${
        isOwn ? "text-white/75" : "text-[var(--accent)]"
      }`}
    >
      <Forward size={13} />
      <span className="min-w-0 truncate">
        {label} · {senderName}
      </span>
    </div>
  );
}

function ReplyPreviewCard({
  isOwn,
  onClick,
  preview,
}: {
  isOwn: boolean;
  onClick: () => void;
  preview: MessagePreview;
}) {
  return (
    <button
      className={`mb-2 flex w-full min-w-0 items-center gap-2 rounded-[14px] border-l-2 px-2.5 py-2 text-left transition ${
        isOwn
          ? "border-white/70 bg-white/14 hover:bg-white/20"
          : "border-[var(--accent)] bg-[var(--hover-soft)] hover:bg-[var(--active-soft)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs font-semibold ${
            isOwn ? "text-white" : "text-[var(--accent)]"
          }`}
        >
          {getUserDisplayName(preview.sender)}
        </span>
        <span className="block truncate text-xs opacity-80">
          {formatMessagePreview(preview)}
        </span>
      </span>
    </button>
  );
}

function ComposerReplyPreview({
  message,
  onCancel,
}: {
  message: Message;
  onCancel: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-[18px] border border-[var(--border-soft)] bg-[var(--input-bg)]/75 px-3 py-2 shadow-sm backdrop-blur-xl">
      <div className="h-9 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--accent)]">
          {ru.chats.replyingTo} {getUserDisplayName(message.sender)}
        </p>
        <p className="truncate text-sm text-[var(--text-muted)]">
          {formatMessagePreview(message)}
        </p>
      </div>
      <button
        aria-label={ru.chats.cancelReply}
        className="ios-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)]"
        onClick={onCancel}
        title={ru.chats.cancelReply}
        type="button"
      >
        <X size={17} />
      </button>
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
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!message.mediaUrl || !message.mediaType) {
      setObjectUrl(null);
      setHasError(false);
      return;
    }

    let isActive = true;
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    setHasError(false);

    getMessageMediaBlob(message.mediaUrl)
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob);

        if (isActive) {
          setObjectUrl(nextObjectUrl);
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      })
      .catch(() => {
        if (isActive) {
          setHasError(true);
        }
      });

    return () => {
      isActive = false;

      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [message.mediaType, message.mediaUrl]);

  if (!message.mediaUrl || !message.mediaType) {
    return null;
  }

  if (hasError) {
    return (
      <p className="mb-2 text-sm text-[var(--danger)]">
        {ru.chats.errors.uploadMedia}
      </p>
    );
  }

  if (!objectUrl) {
    return (
      <p className="mb-2 text-sm text-[var(--text-muted)]">
        {ru.chats.loadingMessages}
      </p>
    );
  }

  if (message.mediaType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="mb-2 max-h-[320px] w-full max-w-[320px] rounded-[16px] object-cover"
        src={objectUrl}
      />
    );
  }

  if (message.mediaType === "video") {
    return (
      <video
        className="mb-2 max-h-[320px] w-full max-w-[360px] rounded-[16px] bg-black"
        controls
        src={objectUrl}
      />
    );
  }

  if (message.mediaType === "audio") {
    return <audio className="mb-2 w-[260px] max-w-full" controls src={objectUrl} />;
  }

  return (
    <a
      className="mb-2 flex max-w-[280px] items-center gap-3 rounded-[16px] border border-white/10 bg-black/10 px-3 py-2 text-[var(--text-main)] transition hover:bg-black/20"
      download={getUploadFilename(message.mediaUrl)}
      href={objectUrl}
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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-sm font-semibold text-[var(--accent)] shadow-[inset_0_0_0_0.5px_var(--border-soft)]">
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

function getChatTitle(chat: Chat) {
  if (chat.type === "private") {
    return chat.partner ? getUserDisplayName(chat.partner) : ru.chats.privateChat;
  }

  return chat.title || (chat.type === "channel" ? ru.chats.channel : ru.chats.group);
}

function getChatSubtitle(chat: Chat) {
  if (chat.type === "private") {
    return chat.partner ? `@${chat.partner.username}` : ru.chats.noParticipant;
  }

  if (chat.type === "channel") {
    return ru.chats.channel;
  }

  return ru.chats.membersCount(chat.memberCount);
}

function getEmptyChatTitle(chat: Chat) {
  if (chat.type === "private" && chat.partner) {
    return ru.chats.chatWith(chat.partner.username);
  }

  return getChatTitle(chat);
}

function canPostInChat(chat: Chat | null) {
  if (!chat) {
    return false;
  }

  if (chat.type === "channel") {
    return ["owner", "admin"].includes(chat.currentUserRole ?? "");
  }

  return true;
}

function formatMessagePreview(message: {
  text: string | null;
  mediaType: string | null;
  deletedAt?: string | null;
}) {
  if (message.deletedAt) {
    return ru.chats.messageDeleted;
  }

  const text = message.text?.trim();

  if (text) {
    return text.length > 90 ? `${text.slice(0, 87)}...` : text;
  }

  if (message.mediaType === "image") {
    return ru.chats.photo;
  }

  if (message.mediaType === "video") {
    return ru.chats.video;
  }

  if (message.mediaType === "audio") {
    return ru.chats.audio;
  }

  if (message.mediaType === "document") {
    return ru.chats.document;
  }

  return ru.chats.message;
}

function mergeReactionGroups(
  currentReactions: MessageReactionGroup[],
  nextReactions: MessageReactionGroup[],
  preserveReactedByMe: boolean,
) {
  if (!preserveReactedByMe) {
    return nextReactions;
  }

  const currentReactedByMe = new Map(
    currentReactions.map((reaction) => [reaction.emoji, reaction.reactedByMe]),
  );

  return nextReactions.map((reaction) => ({
    ...reaction,
    reactedByMe: currentReactedByMe.get(reaction.emoji) ?? false,
  }));
}

function toggleReactionOptimistically(
  reactions: MessageReactionGroup[],
  emoji: string,
  currentUser: {
    id: string;
    username: string;
    displayName: string | null;
    nameEmoji: string | null;
    avatarUrl: string | null;
  },
) {
  const nextReactions = reactions.map((reaction) => ({ ...reaction }));
  const reactionIndex = nextReactions.findIndex(
    (reaction) => reaction.emoji === emoji,
  );

  if (reactionIndex >= 0) {
    const reaction = nextReactions[reactionIndex];

    if (reaction.reactedByMe) {
      const nextCount = reaction.count - 1;

      if (nextCount <= 0) {
        return nextReactions.filter((item) => item.emoji !== emoji);
      }

      nextReactions[reactionIndex] = {
        ...reaction,
        count: nextCount,
        reactedByMe: false,
        usersPreview: reaction.usersPreview.filter(
          (user) => user.id !== currentUser.id,
        ),
      };

      return nextReactions;
    }

    nextReactions[reactionIndex] = {
      ...reaction,
      count: reaction.count + 1,
      reactedByMe: true,
      usersPreview:
        reaction.usersPreview.length >= 3 ||
        reaction.usersPreview.some((user) => user.id === currentUser.id)
          ? reaction.usersPreview
          : [...reaction.usersPreview, currentUser],
    };

    return nextReactions;
  }

  const nextReaction = {
    emoji,
    count: 1,
    reactedByMe: true,
    usersPreview: [currentUser],
  };

  return [...nextReactions, nextReaction].sort(
    (left, right) =>
      getReactionOrder(left.emoji) - getReactionOrder(right.emoji),
  );
}

function getReactionOrder(emoji: string) {
  const index = SUPPORTED_MESSAGE_REACTIONS.findIndex((item) => item === emoji);
  return index >= 0 ? index : SUPPORTED_MESSAGE_REACTIONS.length;
}

function formatReactionUsersPreview(reaction: MessageReactionGroup) {
  if (!reaction.usersPreview.length) {
    return ru.chats.noReactionsYet;
  }

  return reaction.usersPreview.map(getUserDisplayName).join(", ");
}

function formatReactionError(error: unknown) {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();

    if (message.includes("unsupported reaction")) {
      return ru.chats.errors.unsupportedReaction;
    }

    return error.message;
  }

  return ru.chats.errors.reactionFailed;
}

function canManageSelectedChat(chat: Chat | null) {
  return (
    (chat?.type === "group" || chat?.type === "channel") &&
    ["owner", "admin"].includes(chat.currentUserRole ?? "")
  );
}

function getChatSettingsLabel(chat: Chat) {
  return chat.type === "channel" ? ru.chats.channelSettings : ru.chats.groupSettings;
}

function getRoleLabel(role: string) {
  if (role === "owner") {
    return ru.chats.owner;
  }

  if (role === "admin") {
    return ru.chats.admin;
  }

  if (role === "subscriber") {
    return ru.chats.subscriber;
  }

  return ru.chats.member;
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
    return getChatSubtitle(chat);
  }

  if (!messagePreviewEnabled) {
    return ru.chats.newMessage;
  }

  if (chat.lastMessage.text?.trim()) {
    const text = chat.lastMessage.text.trim();

    if (chat.type !== "private") {
      return `${getUserDisplayName(chat.lastMessage.sender)}: ${text}`;
    }

    return text;
  }

  if (chat.lastMessage.mediaType === "image") {
    return ru.chats.photo;
  }

  if (chat.lastMessage.mediaType === "video") {
    return ru.chats.video;
  }

  if (chat.lastMessage.mediaType === "audio") {
    return ru.chats.audio;
  }

  if (chat.lastMessage.mediaType === "document") {
    return ru.chats.document;
  }

  return ru.chats.message;
}

function getSupportedVoiceMimeType() {
  return (
    VOICE_MIME_TYPE_OPTIONS.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? null
  );
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

function formatJoinedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
    return ru.settings.appearance.light;
  }

  if (theme === "dark") {
    return ru.settings.appearance.dark;
  }

  return ru.settings.appearance.system;
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

function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMessageDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameMessageDay(value, today.toISOString())) {
    return ru.chats.today;
  }

  if (isSameMessageDay(value, yesterday.toISOString())) {
    return ru.chats.yesterday;
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
