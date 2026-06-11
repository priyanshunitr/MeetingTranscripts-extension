import { admin, firestore } from "../lib/firestore";
import {
  CHAT_MESSAGES_COLLECTION,
  CHATS_COLLECTION,
  type ChatMessageRole,
  type ChatMessageSource,
  type TokenUsage,
} from "../models/chat.model";
import { RECORDINGS_COLLECTION } from "../models/recording.model";
import type {
  CreateChatMessageInput,
  CreateChatSessionInput,
} from "../schema/chat.schema";
import { generateChatAnswer } from "./chat-ai.services";
import { generateEmbeddings } from "./embedding.services";
import { searchRecordingChunks } from "./qdrant.services";
import { findRecordingById } from "./recording.services";
import { incrementUsageMetrics } from "./usage.services";
import { ApiError } from "../utils/ApiError.js";

export type AppChatSession = {
  id: string;
  userId: string;
  recordingId: string;
  title: string;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
};

export type AppChatMessage = {
  id: string;
  userId: string;
  recordingId: string;
  chatId: string;
  role: ChatMessageRole;
  content: string;
  sources: ChatMessageSource[];
  model: string;
  tokenUsage: TokenUsage;
  createdAt?: FirebaseFirestore.Timestamp;
};

const chatsCollection = (recordingId: string) => {
  return firestore
    .collection(RECORDINGS_COLLECTION)
    .doc(recordingId)
    .collection(CHATS_COLLECTION);
};

//----------------------------------------------------------------------------------------------------------------

const messagesCollection = (recordingId: string, chatId: string) => {
  return chatsCollection(recordingId)
    .doc(chatId)
    .collection(CHAT_MESSAGES_COLLECTION);
};

//----------------------------------------------------------------------------------------------------------------

const toChatSession = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AppChatSession | null => {
  if (!snapshot.exists) return null;

  const data = snapshot.data() as Omit<AppChatSession, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
};

//----------------------------------------------------------------------------------------------------------------

const toChatMessage = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AppChatMessage | null => {
  if (!snapshot.exists) return null;

  const data = snapshot.data() as Omit<AppChatMessage, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
};

//----------------------------------------------------------------------------------------------------------------

const emptyTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

//----------------------------------------------------------------------------------------------------------------

const assertRecordingReadyForChat = (recording: { status?: unknown }) => {
  if (recording.status !== "completed") {
    throw new ApiError(409, "Chat is available after processing is complete");
  }
};

//----------------------------------------------------------------------------------------------------------------

const getChatHistory = async (recordingId: string, chatId: string) => {
  const snapshot = await messagesCollection(recordingId, chatId)
    .orderBy("createdAt", "asc")
    .limit(20)
    .get();

  return snapshot.docs
    .map(toChatMessage)
    .filter((message): message is AppChatMessage => Boolean(message));
};

//----------------------------------------------------------------------------------------------------------------

// Creates a new chat session for a recording after verifying user ownership.
export const createChatSession = async (
  recordingId: string,
  input: CreateChatSessionInput & { userId: string },
) => {
  const recording = await findRecordingById(recordingId, input.userId);

  if (!recording) {
    return null;
  }

  assertRecordingReadyForChat(recording);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = chatsCollection(recordingId).doc();
  const chat = {
    userId: input.userId,
    recordingId,
    title: input.title.trim(),
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(chat);

  return {
    id: docRef.id,
    ...chat,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Lists chat sessions for a recording after verifying user ownership.
export const listChatSessions = async (recordingId: string, userId: string) => {
  const recording = await findRecordingById(recordingId, userId);

  if (!recording) {
    return null;
  }

  const snapshot = await chatsCollection(recordingId).get();

  return snapshot.docs
    .map(toChatSession)
    .filter((chat): chat is AppChatSession => Boolean(chat));
};

//----------------------------------------------------------------------------------------------------------------

// Finds one chat session for a recording after verifying user ownership.
export const findChatSessionById = async (
  recordingId: string,
  chatId: string,
  userId: string,
) => {
  const recording = await findRecordingById(recordingId, userId);

  if (!recording) {
    return null;
  }

  assertRecordingReadyForChat(recording);

  const snapshot = await chatsCollection(recordingId).doc(chatId).get();
  const chat = toChatSession(snapshot);

  if (!chat || chat.userId !== userId) {
    return null;
  }

  return chat;
};

//----------------------------------------------------------------------------------------------------------------

// Finds one chat session with its recent messages.
export const findChatSessionWithMessages = async (
  recordingId: string,
  chatId: string,
  userId: string,
) => {
  const chat = await findChatSessionById(recordingId, chatId, userId);

  if (!chat) {
    return null;
  }

  return {
    ...chat,
    messages: await getChatHistory(recordingId, chatId),
  };
};

//----------------------------------------------------------------------------------------------------------------

// Deletes one chat session for a recording after verifying user ownership.
export const deleteChatSession = async (
  recordingId: string,
  chatId: string,
  userId: string,
) => {
  const chat = await findChatSessionById(recordingId, chatId, userId);

  if (!chat) {
    return null;
  }

  await chatsCollection(recordingId).doc(chatId).delete();

  return {
    id: chatId,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Saves a user chat message, answers it with retrieved chunks, and saves the assistant reply.
export const createChatMessage = async (
  recordingId: string,
  chatId: string,
  input: CreateChatMessageInput & { userId: string },
) => {
  const chat = await findChatSessionById(recordingId, chatId, input.userId);

  if (!chat) {
    return null;
  }

  const question = input.content.trim();
  const queryEmbeddings = await generateEmbeddings([
    {
      chunkIndex: 0,
      text: question,
      tokenCount: Math.ceil(question.length / 4),
    },
  ]);
  const queryEmbedding = queryEmbeddings[0]?.embedding ?? [];
  const chunks = await searchRecordingChunks({
    userId: input.userId,
    recordingId,
    queryEmbedding,
    limit: 5,
  });
  const history = await getChatHistory(recordingId, chatId);
  const answer = await generateChatAnswer({
    question,
    chunks,
    history,
  });
  await incrementUsageMetrics({
    userId: input.userId,
    aiRequestCount: 2,
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const userMessageRef = messagesCollection(recordingId, chatId).doc();
  const assistantMessageRef = messagesCollection(recordingId, chatId).doc();
  const sources = chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    startTime: chunk.startTime,
    endTime: chunk.endTime,
    textPreview: chunk.textPreview,
  }));
  const userMessage = {
    userId: input.userId,
    recordingId,
    chatId,
    role: "user" as const,
    content: question,
    sources: [],
    model: "",
    tokenUsage: emptyTokenUsage,
    createdAt: now,
  };
  const assistantMessage = {
    userId: input.userId,
    recordingId,
    chatId,
    role: "assistant" as const,
    content: answer.content,
    sources,
    model: answer.model,
    tokenUsage: emptyTokenUsage,
    createdAt: now,
  };
  const batch = firestore.batch();

  batch.set(userMessageRef, userMessage);
  batch.set(assistantMessageRef, assistantMessage);
  batch.update(chatsCollection(recordingId).doc(chatId), {
    updatedAt: now,
  });
  batch.update(firestore.collection(RECORDINGS_COLLECTION).doc(recordingId), {
    "stats.chatCount": admin.firestore.FieldValue.increment(1),
    "stats.aiRequestCount": admin.firestore.FieldValue.increment(1),
    updatedAt: now,
  });

  await batch.commit();

  return {
    userMessage: {
      id: userMessageRef.id,
      ...userMessage,
    },
    assistantMessage: {
      id: assistantMessageRef.id,
      ...assistantMessage,
    },
  };
};
