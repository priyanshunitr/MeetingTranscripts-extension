import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDocUpdate = vi.fn();
const mockDocGet = vi.fn();
const mockCollection = vi.fn();
const mockTranscribeAudioUrl = vi.fn();
const mockSaveTranscriptSegments = vi.fn();
const mockIncrementUsageMetrics = vi.fn();
const mockEnqueueSummarizeRecording = vi.fn();
const mockEnqueueEmbedRecording = vi.fn();
const mockGenerateRecordingSummary = vi.fn();
const mockGenerateTranscriptEmbeddings = vi.fn();
const mockStoreRecordingEmbeddings = vi.fn();
const mockSaveTranscriptChunks = vi.fn();
const mockCreateSignedDownloadUrl = vi.fn();

vi.mock("../src/lib/firestore", () => ({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => "SERVER_TIMESTAMP",
      },
    },
  },
  firestore: {
    collection: mockCollection,
  },
}));

vi.mock("../src/services/deepgram.services", () => ({
  transcribeAudioUrl: mockTranscribeAudioUrl,
}));

vi.mock("../src/services/transcript-segment.services", () => ({
  saveTranscriptSegments: mockSaveTranscriptSegments,
}));

vi.mock("../src/services/usage.services", () => ({
  incrementUsageMetrics: mockIncrementUsageMetrics,
}));

vi.mock("../src/jobs/recording.queue", () => ({
  enqueueSummarizeRecording: mockEnqueueSummarizeRecording,
  enqueueEmbedRecording: mockEnqueueEmbedRecording,
}));

vi.mock("../src/services/summary.services", () => ({
  generateRecordingSummary: mockGenerateRecordingSummary,
}));

vi.mock("../src/services/embedding.services", () => ({
  generateTranscriptEmbeddings: mockGenerateTranscriptEmbeddings,
}));

vi.mock("../src/services/qdrant.services", () => ({
  storeRecordingEmbeddings: mockStoreRecordingEmbeddings,
}));

vi.mock("../src/services/s3.services", () => ({
  createSignedDownloadUrl: mockCreateSignedDownloadUrl,
}));

vi.mock("../src/services/transcript-chunk.services", () => ({
  saveTranscriptChunks: mockSaveTranscriptChunks,
}));

const {
  handleEmbedRecording,
  handleSummarizeRecording,
  handleTranscribeRecording,
} = await import("../src/jobs/recording.handlers");

const jobData = {
  recordingId: "recording_123",
  userId: "user_123",
};

describe("recording job handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDocUpdate.mockResolvedValue(undefined);
    mockDocGet.mockResolvedValue({
      data: () => ({
        audio: {
          fileUrl: "https://s3.example/audio.m4a",
          s3Key: "users/user_123/recordings/recording_123/audio.m4a",
          durationSeconds: 120,
        },
        transcript: {
          fullText: "Speaker 1: Let's launch next week.",
        },
      }),
    });
    mockCollection.mockReturnValue({
      doc: () => ({
        get: mockDocGet,
        update: mockDocUpdate,
      }),
    });
  });

  //----------------------------------------------------------------------------------------------------------------

  it("transcribes audio, saves segments, tracks usage, and queues summary", async () => {
    mockCreateSignedDownloadUrl.mockReturnValue(
      "https://s3.example/audio.m4a?X-Amz-Signature=signature",
    );
    mockTranscribeAudioUrl.mockResolvedValue({
      transcript: "Speaker 1: Let's launch next week.",
      raw: {
        metadata: {
          request_id: "dg_request_123",
        },
      },
    });

    await handleTranscribeRecording(jobData);

    expect(mockCreateSignedDownloadUrl).toHaveBeenCalledWith({
      s3Key: "users/user_123/recordings/recording_123/audio.m4a",
    });
    expect(mockTranscribeAudioUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: "https://s3.example/audio.m4a?X-Amz-Signature=signature",
      }),
    );
    expect(mockSaveTranscriptSegments).toHaveBeenCalledWith(
      expect.any(Object),
      "user_123",
      "recording_123",
    );
    expect(mockIncrementUsageMetrics).toHaveBeenCalledWith({
      userId: "user_123",
      transcriptionMinutes: 2,
    });
    expect(mockEnqueueSummarizeRecording).toHaveBeenCalledWith(jobData);
  });

  //----------------------------------------------------------------------------------------------------------------

  it("summarizes transcript and queues embedding", async () => {
    mockGenerateRecordingSummary.mockResolvedValue({
      summary: "Detailed summary",
      shortSummary: "Short summary",
      keyPoints: ["Launch next week"],
      decisions: ["Launch approved"],
      actionItems: [
        {
          task: "Complete QA",
          owner: "John",
          dueDate: "Friday",
          status: "pending",
        },
      ],
    });

    await handleSummarizeRecording(jobData);

    expect(mockGenerateRecordingSummary).toHaveBeenCalledWith(
      "Speaker 1: Let's launch next week.",
    );
    expect(mockIncrementUsageMetrics).toHaveBeenCalledWith({
      userId: "user_123",
      aiRequestCount: 1,
    });
    expect(mockEnqueueEmbedRecording).toHaveBeenCalledWith(jobData);
  });

  //----------------------------------------------------------------------------------------------------------------

  it("generates embeddings, stores vectors/chunks, and marks completed", async () => {
    const embeddings = [
      {
        chunkIndex: 0,
        text: "Speaker 1: Let's launch next week.",
        tokenCount: 10,
        embedding: [0.1, 0.2],
        provider: "openai",
        model: "embedding-model",
      },
    ];
    mockGenerateTranscriptEmbeddings.mockResolvedValue(embeddings);
    mockStoreRecordingEmbeddings.mockResolvedValue({
      collectionName: "recording_chunks",
      storedCount: 1,
    });

    await handleEmbedRecording(jobData);

    expect(mockGenerateTranscriptEmbeddings).toHaveBeenCalledWith(
      "Speaker 1: Let's launch next week.",
    );
    expect(mockStoreRecordingEmbeddings).toHaveBeenCalledWith({
      recordingId: "recording_123",
      userId: "user_123",
      embeddings,
    });
    expect(mockSaveTranscriptChunks).toHaveBeenCalledWith({
      recordingId: "recording_123",
      userId: "user_123",
      embeddings,
    });
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        "search.embeddingStatus": "completed",
        "search.vectorCollection": "recording_chunks",
      }),
    );
  });
});
