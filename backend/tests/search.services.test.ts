import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateEmbeddings = vi.fn();
const mockListRecordings = vi.fn();
const mockSearchUserChunks = vi.fn();
const mockIncrementUsageMetrics = vi.fn();

vi.mock("../src/services/embedding.services", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

vi.mock("../src/services/recording.services", () => ({
  listRecordings: mockListRecordings,
}));

vi.mock("../src/services/qdrant.services", () => ({
  searchUserChunks: mockSearchUserChunks,
}));

vi.mock("../src/services/usage.services", () => ({
  incrementUsageMetrics: mockIncrementUsageMetrics,
}));

const { searchRecordings } = await import("../src/services/search.services");

describe("search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateEmbeddings.mockResolvedValue([
      {
        chunkIndex: 0,
        embedding: [0.1, 0.2],
        model: "embedding-model",
        provider: "openai",
        text: "launch",
        tokenCount: 2,
      },
    ]);
    mockIncrementUsageMetrics.mockResolvedValue(undefined);
  });

  //----------------------------------------------------------------------------------------------------------------

  it("filters semantic results to active non-deleted recordings", async () => {
    mockListRecordings.mockResolvedValue([
      {
        id: "active_recording",
        title: "Active launch",
        status: "completed",
        transcript: {
          fullText: "Launch plan",
        },
      },
    ]);
    mockSearchUserChunks.mockResolvedValue([
      {
        recordingId: "deleted_recording",
        chunkId: "chunk_0",
        score: 0.99,
        textPreview: "Deleted private transcript",
      },
      {
        recordingId: "active_recording",
        chunkId: "chunk_1",
        score: 0.8,
        textPreview: "Launch plan",
      },
    ]);

    const results = await searchRecordings({
      limit: 10,
      mode: "semantic",
      q: "launch",
      userId: "user_123",
    });

    expect(mockSearchUserChunks).toHaveBeenCalledWith({
      userId: "user_123",
      queryEmbedding: [0.1, 0.2],
      limit: 50,
    });
    expect(results.semanticResults).toEqual([
      expect.objectContaining({
        recordingId: "active_recording",
      }),
    ]);
  });

  //----------------------------------------------------------------------------------------------------------------

  it("skips semantic search when the user has no active recordings", async () => {
    mockListRecordings.mockResolvedValue([]);

    const results = await searchRecordings({
      limit: 10,
      mode: "semantic",
      q: "launch",
      userId: "user_123",
    });

    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
    expect(mockSearchUserChunks).not.toHaveBeenCalled();
    expect(results.semanticResults).toEqual([]);
  });
});
