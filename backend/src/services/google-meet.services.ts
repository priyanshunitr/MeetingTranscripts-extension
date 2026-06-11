import { admin, firestore } from "../lib/firestore";
import { RECORDINGS_COLLECTION } from "../models/recording.model";
import type { ImportGoogleMeetInput } from "../schema/google-meet.schema";
import { ApiError } from "../utils/ApiError.js";
import { enqueueSummarizeRecording } from "../jobs/recording.queue";
import { createRecording, findRecordingById } from "./recording.services";
import {
  saveTranscriptSegmentInputs,
  type TranscriptSegmentInput,
} from "./transcript-segment.services";

const MEET_API_BASE_URL = "https://meet.googleapis.com/v2";

type MeetConferenceRecord = {
  name: string;
  startTime?: string;
  endTime?: string;
};

type MeetTranscript = {
  name: string;
  state?: string;
};

type MeetTranscriptEntry = {
  name: string;
  participant?: string;
  text?: string;
  languageCode?: string;
  startTime?: string;
  endTime?: string;
};

type MeetParticipant = {
  name: string;
  signedinUser?: {
    displayName?: string;
  };
  anonymousUser?: {
    displayName?: string;
  };
  phoneUser?: {
    displayName?: string;
  };
};

type ImportGoogleMeetRecordingInput = ImportGoogleMeetInput & {
  userId: string;
};

const recordingsCollection = () => firestore.collection(RECORDINGS_COLLECTION);

//----------------------------------------------------------------------------------------------------------------

export const parseMeetCode = (value: string) => {
  const trimmed = value.trim().toLowerCase();

  try {
    const url = new URL(trimmed);
    const pathCode = url.pathname.match(/[a-z]{3}-?[a-z]{4}-?[a-z]{3}/i)?.[0];

    if (pathCode) {
      return formatMeetCode(pathCode);
    }
  } catch {
    // Plain meeting codes are handled below.
  }

  const rawCode = trimmed.match(/[a-z]{3}-?[a-z]{4}-?[a-z]{3}/i)?.[0];

  if (!rawCode) {
    throw new ApiError(400, "Enter a valid Google Meet link or meeting code");
  }

  return formatMeetCode(rawCode);
};

//----------------------------------------------------------------------------------------------------------------

const formatMeetCode = (value: string) => {
  const compact = value.replace(/-/g, "").toLowerCase();

  if (!/^[a-z]{10}$/.test(compact)) {
    throw new ApiError(400, "Enter a valid Google Meet link or meeting code");
  }

  return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7)}`;
};

//----------------------------------------------------------------------------------------------------------------

const meetApiRequest = async <T>(
  path: string,
  googleAccessToken: string,
  params?: Record<string, string>,
) => {
  const url = new URL(`${MEET_API_BASE_URL}${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
    },
  });
  const data = (await response.json().catch(() => null)) as T | {
    error?: {
      message?: string;
      status?: string;
    };
  } | null;

  if (!response.ok) {
    const error = data as { error?: { message?: string; status?: string } } | null;
    const message =
      error?.error?.message ??
      "Google Meet API request failed. Check Meet permissions and transcript availability.";

    throw new ApiError(response.status, message, [data]);
  }

  return data as T;
};

//----------------------------------------------------------------------------------------------------------------

const listMeetPages = async <T>(
  path: string,
  googleAccessToken: string,
  collectionKey: string,
  params: Record<string, string> = {},
) => {
  const items: T[] = [];
  let pageToken = "";

  do {
    const data = await meetApiRequest<Record<string, unknown>>(
      path,
      googleAccessToken,
      {
        pageSize: "100",
        ...params,
        ...(pageToken ? { pageToken } : {}),
      },
    );

    const pageItems = data[collectionKey];

    if (Array.isArray(pageItems)) {
      items.push(...(pageItems as T[]));
    }

    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
  } while (pageToken);

  return items;
};

//----------------------------------------------------------------------------------------------------------------

const listConferenceRecords = (meetCode: string, googleAccessToken: string) => {
  return listMeetPages<MeetConferenceRecord>(
    "/conferenceRecords",
    googleAccessToken,
    "conferenceRecords",
    {
      filter: `space.meeting_code = "${meetCode}"`,
    },
  );
};

//----------------------------------------------------------------------------------------------------------------

const listTranscripts = (
  conferenceRecordName: string,
  googleAccessToken: string,
) => {
  return listMeetPages<MeetTranscript>(
    `/${conferenceRecordName}/transcripts`,
    googleAccessToken,
    "transcripts",
  );
};

//----------------------------------------------------------------------------------------------------------------

const listTranscriptEntries = (
  transcriptName: string,
  googleAccessToken: string,
) => {
  return listMeetPages<MeetTranscriptEntry>(
    `/${transcriptName}/entries`,
    googleAccessToken,
    "transcriptEntries",
  );
};

//----------------------------------------------------------------------------------------------------------------

const listParticipants = (
  conferenceRecordName: string,
  googleAccessToken: string,
) => {
  return listMeetPages<MeetParticipant>(
    `/${conferenceRecordName}/participants`,
    googleAccessToken,
    "participants",
  );
};

//----------------------------------------------------------------------------------------------------------------

const getParticipantDisplayName = (participant?: MeetParticipant) => {
  return (
    participant?.signedinUser?.displayName?.trim() ||
    participant?.anonymousUser?.displayName?.trim() ||
    participant?.phoneUser?.displayName?.trim() ||
    "Unknown speaker"
  );
};

//----------------------------------------------------------------------------------------------------------------

const toSecondsAfter = (timestamp: string | undefined, startMs: number) => {
  if (!timestamp) return 0;

  const time = Date.parse(timestamp);

  if (!Number.isFinite(time)) return 0;

  return Math.max((time - startMs) / 1000, 0);
};

//----------------------------------------------------------------------------------------------------------------

const getWordCount = (transcript: string) => {
  return transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
};

//----------------------------------------------------------------------------------------------------------------

const isFiniteNumber = (value: number | null): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

//----------------------------------------------------------------------------------------------------------------

const parseTimestamp = (timestamp: string | undefined) => {
  const time = Date.parse(timestamp ?? "");
  return Number.isFinite(time) ? time : null;
};

//----------------------------------------------------------------------------------------------------------------

const getDurationSeconds = (entries: MeetTranscriptEntry[]) => {
  const starts = entries
    .map((entry) => parseTimestamp(entry.startTime))
    .filter(isFiniteNumber);
  const ends = entries
    .map((entry) => parseTimestamp(entry.endTime ?? entry.startTime))
    .filter(isFiniteNumber);

  if (!starts.length || !ends.length) return 0;

  return Math.max((Math.max(...ends) - Math.min(...starts)) / 1000, 0);
};

//----------------------------------------------------------------------------------------------------------------

const buildImportedTranscript = (
  entries: MeetTranscriptEntry[],
  participants: MeetParticipant[],
  userId: string,
  recordingId: string,
) => {
  const participantMap = new Map(
    participants.map((participant) => [participant.name, participant]),
  );
  const sortedEntries = entries
    .filter((entry) => entry.text?.trim())
    .sort(
      (left, right) =>
        (parseTimestamp(left.startTime) ?? Number.MAX_SAFE_INTEGER) -
        (parseTimestamp(right.startTime) ?? Number.MAX_SAFE_INTEGER),
    );
  const firstStart =
    sortedEntries
      .map((entry) => parseTimestamp(entry.startTime))
      .filter(isFiniteNumber)
      .at(0) ?? Date.now();
  const segments: TranscriptSegmentInput[] = sortedEntries.map((entry) => {
    const speaker = getParticipantDisplayName(
      entry.participant ? participantMap.get(entry.participant) : undefined,
    );

    return {
      userId,
      recordingId,
      speaker,
      speakerLabel: speaker,
      text: entry.text?.trim() ?? "",
      startTime: toSecondsAfter(entry.startTime, firstStart),
      endTime: toSecondsAfter(entry.endTime ?? entry.startTime, firstStart),
      confidence: 1,
      words: [],
    };
  });
  const fullText = segments
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n\n");

  return {
    fullText,
    languageCode: sortedEntries[0]?.languageCode ?? "",
    segments,
  };
};

//----------------------------------------------------------------------------------------------------------------

const findTranscriptWithEntries = async (
  conferenceRecords: MeetConferenceRecord[],
  googleAccessToken: string,
) => {
  const newestFirst = [...conferenceRecords].sort(
    (left, right) =>
      (parseTimestamp(right.startTime) ?? 0) - (parseTimestamp(left.startTime) ?? 0),
  );

  for (const conferenceRecord of newestFirst) {
    const transcripts = await listTranscripts(conferenceRecord.name, googleAccessToken);
    const entriesByTranscript = await Promise.all(
      transcripts.map((transcript) => listTranscriptEntries(transcript.name, googleAccessToken)),
    );
    const entries = entriesByTranscript.flat();

    if (entries.some((entry) => entry.text?.trim())) {
      return {
        conferenceRecord,
        entries,
        transcripts,
      };
    }
  }

  return null;
};

//----------------------------------------------------------------------------------------------------------------

export const importGoogleMeetRecording = async (
  input: ImportGoogleMeetRecordingInput,
) => {
  const meetCode = parseMeetCode(input.meetLinkOrCode);
  const conferenceRecords = await listConferenceRecords(
    meetCode,
    input.googleAccessToken,
  );

  if (!conferenceRecords.length) {
    throw new ApiError(
      404,
      "No Google Meet conference record was found for this meeting code",
    );
  }

  const transcriptImport = await findTranscriptWithEntries(
    conferenceRecords,
    input.googleAccessToken,
  );

  if (!transcriptImport) {
    throw new ApiError(
      404,
      "No Google Meet transcript entries were found. Make sure transcripts were enabled before the meeting ended.",
    );
  }

  const participants = await listParticipants(
    transcriptImport.conferenceRecord.name,
    input.googleAccessToken,
  );
  const durationSeconds = getDurationSeconds(transcriptImport.entries);
  const recording = await createRecording({
    audio: {
      durationSeconds,
      fileName: `${meetCode}-transcript.txt`,
      fileSize: 0,
      mimeType: "text/plain",
    },
    description: input.description,
    title: input.title?.trim() || `Google Meet ${meetCode}`,
    type: "meeting",
    userId: input.userId,
  });
  const importedTranscript = buildImportedTranscript(
    transcriptImport.entries,
    participants,
    input.userId,
    recording.id,
  );
  const transcriptBytes = Buffer.byteLength(importedTranscript.fullText, "utf8");

  if (!importedTranscript.fullText) {
    throw new ApiError(404, "Google Meet transcript was empty");
  }

  await saveTranscriptSegmentInputs(recording.id, importedTranscript.segments);

  await recordingsCollection().doc(recording.id).update({
    "audio.durationSeconds": durationSeconds,
    "audio.fileSize": transcriptBytes,
    "audio.fileName": `${meetCode}-transcript.txt`,
    "audio.mimeType": "text/plain",
    "audio.uploadedAt": admin.firestore.FieldValue.serverTimestamp(),
    status: "transcribed",
    "transcript.fullText": importedTranscript.fullText,
    "transcript.language": importedTranscript.languageCode,
    "transcript.wordCount": getWordCount(importedTranscript.fullText),
    "transcript.provider": "google_meet",
    "transcript.deepgramRequestId": "",
    "transcript.transcribedAt": admin.firestore.FieldValue.serverTimestamp(),
    "search.embeddingStatus": "transcribed",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await enqueueSummarizeRecording({
    recordingId: recording.id,
    userId: input.userId,
  });

  return findRecordingById(recording.id, input.userId);
};
