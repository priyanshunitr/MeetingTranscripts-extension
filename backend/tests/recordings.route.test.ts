import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateRecording = vi.fn();
const mockListRecordings = vi.fn();
const mockFindRecordingById = vi.fn();
const mockUpdateRecording = vi.fn();
const mockDeleteRecording = vi.fn();
const mockCreateRecordingUploadUrl = vi.fn();
const mockCompleteRecordingUpload = vi.fn();
const mockSearchRecordings = vi.fn();
const mockImportGoogleMeetRecording = vi.fn();
const mockTranscribeAudioUrl = vi.fn();
const mockSplitTranscriptIntoChunks = vi.fn();
const mockGenerateEmbeddings = vi.fn();
const mockVerifyJWT = vi.fn((req: any, _res: any, next: any) => {
  req.user = {
    id: "user_123",
    email: "user@example.com",
    name: "Test User",
  };
  next();
});

vi.mock("../src/middleware/auth.middleware", () => ({
  verifyJWT: mockVerifyJWT,
}));

vi.mock("../src/services/recording.services", () => ({
  createRecording: mockCreateRecording,
  listRecordings: mockListRecordings,
  findRecordingById: mockFindRecordingById,
  updateRecording: mockUpdateRecording,
  deleteRecording: mockDeleteRecording,
  createRecordingUploadUrl: mockCreateRecordingUploadUrl,
  completeRecordingUpload: mockCompleteRecordingUpload,
}));

vi.mock("../src/services/search.services", () => ({
  searchRecordings: mockSearchRecordings,
}));

vi.mock("../src/services/google-meet.services", () => ({
  importGoogleMeetRecording: mockImportGoogleMeetRecording,
}));

vi.mock("../src/services/deepgram.services", () => ({
  transcribeAudioUrl: mockTranscribeAudioUrl,
}));

vi.mock("../src/services/embedding.services", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
  splitTranscriptIntoChunks: mockSplitTranscriptIntoChunks,
}));

vi.mock("../src/routes/recording-chats.route", () => ({
  default: (_req: any, _res: any, next: any) => next(),
}));

const { app } = await import("../src/app");

describe("recordings routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyJWT.mockImplementation((req: any, _res: any, next: any) => {
      req.user = {
        id: "user_123",
        email: "user@example.com",
        name: "Test User",
      };
      next();
    });
  });

  //----------------------------------------------------------------------------------------------------------------

  it("creates a recording with authenticated user context", async () => {
    mockCreateRecording.mockResolvedValue({
      id: "recording_123",
      userId: "user_123",
      title: "Client Meeting",
    });

    const response = await request(app).post("/recordings").send({
      title: "Client Meeting",
      description: "",
      type: "meeting",
    });

    expect(response.status).toBe(201);
    expect(mockCreateRecording).toHaveBeenCalledWith({
      title: "Client Meeting",
      description: "",
      type: "meeting",
      userId: "user_123",
    });
  });

  //----------------------------------------------------------------------------------------------------------------

  it("creates an upload URL with authenticated user context", async () => {
    mockCreateRecordingUploadUrl.mockResolvedValue({
      uploadUrl: "https://s3.example/upload",
      s3Key: "users/user_123/recordings/recording_123/audio.m4a",
    });

    const response = await request(app)
      .post("/recordings/recording_123/upload-url")
      .send({
        fileName: "audio.m4a",
        mimeType: "audio/m4a",
      });

    expect(response.status).toBe(200);
    expect(mockCreateRecordingUploadUrl).toHaveBeenCalledWith(
      "recording_123",
      expect.objectContaining({
        fileName: "audio.m4a",
        mimeType: "audio/m4a",
        userId: "user_123",
      }),
    );
  });

  //----------------------------------------------------------------------------------------------------------------

  it("searches recordings before the dynamic recordingId route", async () => {
    mockSearchRecordings.mockResolvedValue({
      query: "launch",
      mode: "hybrid",
      keywordResults: [],
      semanticResults: [],
    });

    const response = await request(app).get(
      "/recordings/search?q=launch&mode=hybrid",
    );

    expect(response.status).toBe(200);
    expect(mockSearchRecordings).toHaveBeenCalledWith({
      q: "launch",
      mode: "hybrid",
      limit: 10,
      userId: "user_123",
    });
    expect(mockFindRecordingById).not.toHaveBeenCalled();
  });

  //----------------------------------------------------------------------------------------------------------------

  it("imports a Google Meet transcript before the dynamic recordingId route", async () => {
    mockImportGoogleMeetRecording.mockResolvedValue({
      id: "recording_meet_123",
      userId: "user_123",
      title: "Weekly Standup",
    });

    const response = await request(app).post("/recordings/import/google-meet").send({
      description: "Sprint sync",
      googleAccessToken: "google_access_token",
      meetLinkOrCode: "https://meet.google.com/abc-mnop-xyz",
      title: "Weekly Standup",
    });

    expect(response.status).toBe(201);
    expect(mockImportGoogleMeetRecording).toHaveBeenCalledWith({
      description: "Sprint sync",
      googleAccessToken: "google_access_token",
      meetLinkOrCode: "https://meet.google.com/abc-mnop-xyz",
      title: "Weekly Standup",
      userId: "user_123",
    });
    expect(mockFindRecordingById).not.toHaveBeenCalled();
  });

  //----------------------------------------------------------------------------------------------------------------

  it("only forwards editable recording metadata on update", async () => {
    mockUpdateRecording.mockResolvedValue({
      id: "recording_123",
      status: "uploaded",
      title: "Renamed Meeting",
      userId: "user_123",
    });

    const response = await request(app).patch("/recordings/recording_123").send({
      status: "completed",
      title: "Renamed Meeting",
      transcript: {
        fullText: "Injected transcript",
      },
    });

    expect(response.status).toBe(200);
    expect(mockUpdateRecording).toHaveBeenCalledWith("recording_123", {
      title: "Renamed Meeting",
      userId: "user_123",
    });
  });

  //----------------------------------------------------------------------------------------------------------------

  it("rejects update requests that only contain internal recording fields", async () => {
    const response = await request(app).patch("/recordings/recording_123").send({
      status: "completed",
    });

    expect(response.status).toBe(400);
    expect(mockUpdateRecording).not.toHaveBeenCalled();
  });

  //----------------------------------------------------------------------------------------------------------------

  it("returns 404 when a recording is not found", async () => {
    mockFindRecordingById.mockResolvedValue(null);

    const response = await request(app).get("/recordings/missing_recording");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Recording not found");
  });

  //----------------------------------------------------------------------------------------------------------------

  it("protects Deepgram utility routes with JWT middleware", async () => {
    mockVerifyJWT.mockImplementationOnce((_req: any, _res: any, next: any) => {
      next(new Error("blocked by auth"));
    });

    const response = await request(app).get("/deepgram/health");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("blocked by auth");
  });

  //----------------------------------------------------------------------------------------------------------------

  it("protects embedding utility routes with JWT middleware", async () => {
    mockVerifyJWT.mockImplementationOnce((_req: any, _res: any, next: any) => {
      next(new Error("blocked by auth"));
    });

    const response = await request(app).post("/embedding/generate").send({
      transcript: "hello",
    });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("blocked by auth");
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });
});
