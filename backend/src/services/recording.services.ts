import { admin, firestore } from "../lib/firestore";
import { RECORDINGS_COLLECTION } from "../models/recording.model";
import type {
  CompleteRecordingBrowserTranscriptInput,
  CompleteRecordingUploadInput,
  CreateRecordingInput,
  CreateRecordingUploadUrlInput,
  UpdateRecordingInput,
} from "../schema/recording.schema";
import { ApiError } from "../utils/ApiError.js";
import {
  enqueueSummarizeRecording,
  enqueueTranscribeRecording,
} from "../jobs/recording.queue";
import { deleteRecordingVectors } from "./qdrant.services";
import { createSignedUploadUrl } from "./s3.services";
import { incrementUsageMetrics } from "./usage.services";

export type AppRecording = {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  audio: Record<string, unknown>;
  transcript: Record<string, unknown>;
  ai: Record<string, unknown>;
  search: Record<string, unknown>;
  stats: Record<string, unknown>;
  error: Record<string, unknown>;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

const recordingsCollection = () => firestore.collection(RECORDINGS_COLLECTION);

//----------------------------------------------------------------------------------------------------------------

const toRecording = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AppRecording | null => {
  if (!snapshot.exists) return null;

  const data = snapshot.data() as Omit<AppRecording, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
};

//----------------------------------------------------------------------------------------------------------------

const emptyTranscript = {
  fullText: "",
  language: "",
  wordCount: 0,
  provider: "",
  deepgramRequestId: "",
  transcribedAt: null,
};

const emptyAi = {
  summary: "",
  shortSummary: "",
  keyPoints: [],
  decisions: [],
  actionItems: [],
  generatedAt: null,
  model: "",
};

const defaultStats = {
  chatCount: 0,
  aiRequestCount: 0,
  viewCount: 0,
};

const emptyError = {
  message: "",
  stage: "",
  code: "",
};

const cleanUndefined = <T extends Record<string, unknown>>(value: T) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
};

//----------------------------------------------------------------------------------------------------------------

const getRecordingAudioFileUrl = (recording: AppRecording) => {
  const fileUrl = recording.audio.fileUrl;

  if (typeof fileUrl !== "string" || !fileUrl) {
    throw new ApiError(409, "Recording upload URL has not been created");
  }

  return fileUrl;
};

//----------------------------------------------------------------------------------------------------------------

const secondsToMinutes = (seconds: number) => {
  return seconds / 60;
};

//----------------------------------------------------------------------------------------------------------------

const getWordCount = (transcript: string) => {
  return transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
};

//----------------------------------------------------------------------------------------------------------------

// Creates a new recording document with initial metadata and empty processing fields.
export const createRecording = async (
  input: CreateRecordingInput & { userId: string },
) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = recordingsCollection().doc();
  const audioInput = input.audio ?? {};

  const recording = {
    userId: input.userId,
    title: input.title.trim(),
    description: input.description.trim(),
    type: input.type,
    status: audioInput.fileUrl ? "uploaded" : "uploading",
    audio: {
      s3Key: audioInput.s3Key ?? "",
      fileUrl: audioInput.fileUrl ?? "",
      fileName: audioInput.fileName ?? "",
      mimeType: audioInput.mimeType ?? "",
      fileSize: audioInput.fileSize ?? 0,
      durationSeconds: audioInput.durationSeconds ?? 0,
      uploadedAt: audioInput.fileUrl ? now : null,
    },
    transcript: emptyTranscript,
    ai: emptyAi,
    search: {
      keywords: [],
      embeddingStatus: audioInput.fileUrl ? "uploaded" : "uploading",
      vectorNamespace: input.userId,
      vectorCollection: "recording_chunks",
    },
    stats: defaultStats,
    error: emptyError,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await docRef.set(recording);

  return {
    id: docRef.id,
    ...recording,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Lists all non-deleted recordings for a user.
export const listRecordings = async (userId: string) => {
  const snapshot = await recordingsCollection()
    .where("userId", "==", userId)
    .where("deletedAt", "==", null)
    .get();

  return snapshot.docs
    .map(toRecording)
    .filter((recording): recording is AppRecording => Boolean(recording));
};

//----------------------------------------------------------------------------------------------------------------

// Finds one non-deleted recording by ID and verifies it belongs to the user.
export const findRecordingById = async (recordingId: string, userId: string) => {
  const snapshot = await recordingsCollection().doc(recordingId).get();
  const recording = toRecording(snapshot);

  if (!recording || recording.userId !== userId || recording.deletedAt) {
    return null;
  }

  return recording;
};

//----------------------------------------------------------------------------------------------------------------

// Updates user-editable recording metadata only.
export const updateRecording = async (
  recordingId: string,
  input: UpdateRecordingInput & { userId: string },
) => {
  const docRef = recordingsCollection().doc(recordingId);
  const existing = await findRecordingById(recordingId, input.userId);

  if (!existing) {
    return null;
  }

  const updateData = cleanUndefined({
    title: input.title?.trim(),
    description: input.description?.trim(),
    type: input.type,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await docRef.update(updateData);
  return findRecordingById(recordingId, input.userId);
};

//----------------------------------------------------------------------------------------------------------------

// Creates a signed S3 upload URL and saves pending audio metadata on the recording.
export const createRecordingUploadUrl = async (
  recordingId: string,
  input: CreateRecordingUploadUrlInput & { userId: string },
) => {
  const existing = await findRecordingById(recordingId, input.userId);

  if (!existing) {
    return null;
  }

  const signedUpload = createSignedUploadUrl({
    userId: input.userId,
    recordingId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    expiresInSeconds: input.expiresInSeconds,
  });

  await recordingsCollection().doc(recordingId).update({
    "audio.s3Key": signedUpload.s3Key,
    "audio.fileUrl": signedUpload.fileUrl,
    "audio.fileName": input.fileName,
    "audio.mimeType": input.mimeType,
    "audio.fileSize": input.fileSize ?? 0,
    "audio.durationSeconds": input.durationSeconds ?? 0,
    status: "uploading",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return signedUpload;
};

//----------------------------------------------------------------------------------------------------------------

// Marks an S3 upload as complete and queues the transcription job.
export const completeRecordingUpload = async (
  recordingId: string,
  input: CompleteRecordingUploadInput & { userId: string },
) => {
  const existing = await findRecordingById(recordingId, input.userId);

  if (!existing) {
    return null;
  }

  const audioUrl = getRecordingAudioFileUrl(existing);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await recordingsCollection().doc(recordingId).update({
    status: "uploaded",
    "audio.fileSize": input.fileSize,
    "audio.durationSeconds": input.durationSeconds,
    "audio.uploadedAt": now,
    updatedAt: now,
  });

  await incrementUsageMetrics({
    userId: input.userId,
    recordingMinutes: secondsToMinutes(input.durationSeconds),
    storageBytes: input.fileSize,
  });

  await enqueueTranscribeRecording({
    recordingId,
    userId: input.userId,
  });

  return findRecordingById(recordingId, input.userId);
};

//----------------------------------------------------------------------------------------------------------------

// Marks an upload as complete using a browser-generated transcript, then skips Deepgram and queues AI processing.
export const completeRecordingBrowserTranscript = async (
  recordingId: string,
  input: CompleteRecordingBrowserTranscriptInput & { userId: string },
) => {
  const existing = await findRecordingById(recordingId, input.userId);

  if (!existing) {
    return null;
  }

  getRecordingAudioFileUrl(existing);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const transcript = input.transcript.trim();

  await recordingsCollection().doc(recordingId).update({
    status: "transcribed",
    "audio.fileSize": input.fileSize,
    "audio.durationSeconds": input.durationSeconds,
    "audio.uploadedAt": now,
    "transcript.fullText": transcript,
    "transcript.language": input.language,
    "transcript.wordCount": getWordCount(transcript),
    "transcript.provider": "web-speech",
    "transcript.deepgramRequestId": "",
    "transcript.transcribedAt": now,
    "search.embeddingStatus": "transcribed",
    updatedAt: now,
  });

  await incrementUsageMetrics({
    userId: input.userId,
    recordingMinutes: secondsToMinutes(input.durationSeconds),
    storageBytes: input.fileSize,
  });

  await enqueueSummarizeRecording({
    recordingId,
    userId: input.userId,
  });

  return findRecordingById(recordingId, input.userId);
};

//----------------------------------------------------------------------------------------------------------------

// Soft-deletes a recording by setting deletedAt instead of removing the document.
export const deleteRecording = async (recordingId: string, userId: string) => {
  const existing = await findRecordingById(recordingId, userId);

  if (!existing) {
    return null;
  }

  await recordingsCollection().doc(recordingId).update({
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await deleteRecordingVectors({ recordingId, userId }).catch(() => undefined);

  return {
    id: recordingId,
  };
};
