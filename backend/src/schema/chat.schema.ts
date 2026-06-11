import { z } from "zod";
import { TimestampSchema } from "./firestore.schema";

export const ChatSessionSchema = z.object({
  userId: z.string(),
  recordingId: z.string(),
  title: z.string(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const ChatMessageRoleSchema = z.enum(["user", "assistant"]);

export const ChatMessageSourceSchema = z.object({
  chunkId: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  textPreview: z.string(),
});

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const ChatMessageSchema = z.object({
  userId: z.string(),
  recordingId: z.string(),
  chatId: z.string(),
  role: ChatMessageRoleSchema,
  content: z.string(),
  sources: z.array(ChatMessageSourceSchema),
  model: z.string(),
  tokenUsage: TokenUsageSchema,
  createdAt: TimestampSchema,
});

export const CreateChatSessionSchema = z.object({
  title: z.string().min(1).default("New Chat"),
});

export const ChatSessionQuerySchema = z.object({});

export const CreateChatMessageSchema = z.object({
  content: z.string().min(1),
});

export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;
export type ChatMessageSource = z.infer<typeof ChatMessageSourceSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CreateChatSessionInput = z.infer<typeof CreateChatSessionSchema>;
export type CreateChatMessageInput = z.infer<typeof CreateChatMessageSchema>;
