export type ChatSessionModel = {
  userId: string;
  recordingId: string;
  title: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

export type ChatMessageRole = "user" | "assistant";

export type ChatMessageSource = {
  chunkId: string;
  startTime: number;
  endTime: number;
  textPreview: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ChatMessageModel = {
  userId: string;
  recordingId: string;
  chatId: string;
  role: ChatMessageRole;
  content: string;
  sources: ChatMessageSource[];
  model: string;
  tokenUsage: TokenUsage;
  createdAt: FirebaseFirestore.Timestamp;
};

export const CHATS_COLLECTION = "chats";
export const CHAT_MESSAGES_COLLECTION = "messages";
