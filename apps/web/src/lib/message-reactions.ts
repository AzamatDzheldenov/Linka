export const SUPPORTED_MESSAGE_REACTIONS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🔥",
  "👏",
  "🥰",
  "🤯",
] as const;

export const QUICK_MESSAGE_REACTION = "👍";

export type SupportedMessageReaction = (typeof SUPPORTED_MESSAGE_REACTIONS)[number];
