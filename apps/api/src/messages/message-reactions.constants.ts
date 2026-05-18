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

export type SupportedMessageReaction = (typeof SUPPORTED_MESSAGE_REACTIONS)[number];
