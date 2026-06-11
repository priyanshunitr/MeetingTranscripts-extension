import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindRecordingById = vi.fn();

vi.mock("../src/services/recording.services", () => ({
  findRecordingById: mockFindRecordingById,
}));

vi.mock("../src/lib/firestore", () => ({
  admin: {
    firestore: {
      FieldValue: {
        increment: (value: number) => ({ increment: value }),
        serverTimestamp: () => "SERVER_TIMESTAMP",
      },
    },
  },
  firestore: {
    batch: vi.fn(),
    collection: vi.fn(),
  },
}));

vi.mock("../src/services/embedding.services", () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock("../src/services/qdrant.services", () => ({
  searchRecordingChunks: vi.fn(),
}));

vi.mock("../src/services/chat-ai.services", () => ({
  generateChatAnswer: vi.fn(),
}));

vi.mock("../src/services/usage.services", () => ({
  incrementUsageMetrics: vi.fn(),
}));

const { createChatMessage, createChatSession } = await import(
  "../src/services/chat.services"
);

describe("chat service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  //----------------------------------------------------------------------------------------------------------------

  it("rejects chat session creation before recording processing is complete", async () => {
    mockFindRecordingById.mockResolvedValue({
      id: "recording_123",
      status: "embedding",
      userId: "user_123",
    });

    await expect(
      createChatSession("recording_123", {
        title: "Questions",
        userId: "user_123",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Chat is available after processing is complete",
    });
  });

  //----------------------------------------------------------------------------------------------------------------

  it("rejects chat messages before recording processing is complete", async () => {
    mockFindRecordingById.mockResolvedValue({
      id: "recording_123",
      status: "summarizing",
      userId: "user_123",
    });

    await expect(
      createChatMessage("recording_123", "chat_123", {
        content: "What happened?",
        userId: "user_123",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Chat is available after processing is complete",
    });
  });
});
