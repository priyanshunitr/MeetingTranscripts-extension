import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDocUpdate = vi.fn();
const mockCollection = vi.fn();
const mockCreateRecording = vi.fn();
const mockFindRecordingById = vi.fn();
const mockSaveTranscriptSegmentInputs = vi.fn();
const mockEnqueueSummarizeRecording = vi.fn();

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

vi.mock("../src/services/recording.services", () => ({
  createRecording: mockCreateRecording,
  findRecordingById: mockFindRecordingById,
}));

vi.mock("../src/services/transcript-segment.services", () => ({
  saveTranscriptSegmentInputs: mockSaveTranscriptSegmentInputs,
}));

vi.mock("../src/jobs/recording.queue", () => ({
  enqueueSummarizeRecording: mockEnqueueSummarizeRecording,
}));

const { importGoogleMeetRecording, parseMeetCode } = await import(
  "../src/services/google-meet.services"
);

describe("google meet import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCollection.mockReturnValue({
      doc: () => ({
        update: mockDocUpdate,
      }),
    });
    mockCreateRecording.mockResolvedValue({
      id: "recording_123",
      userId: "user_123",
    });
    mockFindRecordingById.mockResolvedValue({
      id: "recording_123",
      status: "transcribed",
      title: "Weekly Standup",
      userId: "user_123",
    });
    mockSaveTranscriptSegmentInputs.mockResolvedValue({
      savedCount: 2,
    });
    mockEnqueueSummarizeRecording.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  //----------------------------------------------------------------------------------------------------------------

  it("normalizes Google Meet links and meeting codes", () => {
    expect(parseMeetCode("abc-mnop-xyz")).toBe("abc-mnop-xyz");
    expect(parseMeetCode("https://meet.google.com/abcmnopxyz")).toBe(
      "abc-mnop-xyz",
    );
  });

  //----------------------------------------------------------------------------------------------------------------

  it("imports transcript entries, maps participants, and queues summary", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/v2/conferenceRecords") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            conferenceRecords: [
              {
                name: "conferenceRecords/old_record",
                startTime: "2026-06-09T10:00:00Z",
              },
              {
                name: "conferenceRecords/new_record",
                startTime: "2026-06-10T10:00:00Z",
              },
            ],
          }),
        };
      }

      if (url.pathname === "/v2/conferenceRecords/new_record/transcripts") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transcripts: [
              { name: "conferenceRecords/new_record/transcripts/transcript_1" },
              { name: "conferenceRecords/new_record/transcripts/transcript_2" },
            ],
          }),
        };
      }

      if (
        url.pathname ===
        "/v2/conferenceRecords/new_record/transcripts/transcript_1/entries"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transcriptEntries: [
              {
                endTime: "2026-06-10T10:00:03Z",
                languageCode: "en-US",
                participant: "conferenceRecords/new_record/participants/p1",
                startTime: "2026-06-10T10:00:00Z",
                text: "Hello team.",
              },
            ],
          }),
        };
      }

      if (
        url.pathname ===
        "/v2/conferenceRecords/new_record/transcripts/transcript_2/entries"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transcriptEntries: [
              {
                endTime: "2026-06-10T10:00:08Z",
                languageCode: "en-US",
                participant: "conferenceRecords/new_record/participants/p2",
                startTime: "2026-06-10T10:00:05Z",
                text: "Ship it.",
              },
            ],
          }),
        };
      }

      if (url.pathname === "/v2/conferenceRecords/new_record/participants") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            participants: [
              {
                name: "conferenceRecords/new_record/participants/p1",
                signedinUser: {
                  displayName: "Priyanshu Sahu",
                },
              },
              {
                name: "conferenceRecords/new_record/participants/p2",
                signedinUser: {
                  displayName: "Ava Rao",
                },
              },
            ],
          }),
        };
      }

      throw new Error(`Unhandled Meet API mock URL: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await importGoogleMeetRecording({
      description: "Sprint sync",
      googleAccessToken: "google_access_token",
      meetLinkOrCode: "https://meet.google.com/abc-mnop-xyz",
      title: "Weekly Standup",
      userId: "user_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer google_access_token",
        },
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'filter=space.meeting_code+%3D+%22abc-mnop-xyz%22',
    );
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(
      "/v2/conferenceRecords/new_record/participants",
    );
    expect(mockCreateRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Sprint sync",
        title: "Weekly Standup",
        type: "meeting",
        userId: "user_123",
      }),
    );
    expect(mockSaveTranscriptSegmentInputs).toHaveBeenCalledWith(
      "recording_123",
      [
        expect.objectContaining({
          endTime: 3,
          speaker: "Priyanshu Sahu",
          speakerLabel: "Priyanshu Sahu",
          startTime: 0,
          text: "Hello team.",
        }),
        expect.objectContaining({
          endTime: 8,
          speaker: "Ava Rao",
          speakerLabel: "Ava Rao",
          startTime: 5,
          text: "Ship it.",
        }),
      ],
    );
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "transcribed",
        "audio.durationSeconds": 8,
        "search.embeddingStatus": "transcribed",
        "transcript.fullText": "Priyanshu Sahu: Hello team.\n\nAva Rao: Ship it.",
        "transcript.language": "en-US",
        "transcript.provider": "google_meet",
        updatedAt: "SERVER_TIMESTAMP",
      }),
    );
    expect(mockEnqueueSummarizeRecording).toHaveBeenCalledWith({
      recordingId: "recording_123",
      userId: "user_123",
    });
    expect(mockFindRecordingById).toHaveBeenCalledWith("recording_123", "user_123");
  });
});
