import { admin, firestore } from "../lib/firestore";
import { RECORDINGS_COLLECTION } from "../models/recording.model";
import { transcribeAudioUrl } from "../services/deepgram.services";
import { generateTranscriptEmbeddings } from "../services/embedding.services";
import { storeRecordingEmbeddings } from "../services/qdrant.services";
import { createSignedDownloadUrl } from "../services/s3.services";
import { generateRecordingSummary } from "../services/summary.services";
import { saveTranscriptChunks } from "../services/transcript-chunk.services";
import { saveTranscriptSegments } from "../services/transcript-segment.services";
import { incrementUsageMetrics } from "../services/usage.services";
import {
  enqueueEmbedRecording,
  enqueueSummarizeRecording,
  type RecordingJobData,
} from "./recording.queue";

const recordingsCollection = () => firestore.collection(RECORDINGS_COLLECTION);

//----------------------------------------------------------------------------------------------------------------

const getWordCount = (transcript: string) => {
  return transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
};

//----------------------------------------------------------------------------------------------------------------

const getDeepgramRequestId = (raw: unknown) => {
  const response = raw as { metadata?: { request_id?: string } };
  return response.metadata?.request_id ?? "";
};

//----------------------------------------------------------------------------------------------------------------

const getDeepgramAudioUrl = async (recordingId: string) => {
  const snapshot = await recordingsCollection().doc(recordingId).get();
  const data = snapshot.data() as
    | { audio?: { fileUrl?: unknown; s3Key?: unknown } }
    | undefined;
  const s3Key = data?.audio?.s3Key;
  const fileUrl = data?.audio?.fileUrl;

  if (typeof s3Key === "string" && s3Key) {
    return createSignedDownloadUrl({
      s3Key,
    });
  }

  if (typeof fileUrl !== "string" || !fileUrl) {
    throw new Error("Recording audio file URL is missing");
  }

  return fileUrl;
};

//----------------------------------------------------------------------------------------------------------------

const getTranscriptText = async (recordingId: string) => {
  const snapshot = await recordingsCollection().doc(recordingId).get();
  const data = snapshot.data() as
    | { transcript?: { fullText?: unknown } }
    | undefined;
  const transcript = data?.transcript?.fullText;

  if (typeof transcript !== "string" || !transcript) {
    throw new Error("Recording transcript is missing");
  }

  return transcript;
};

//----------------------------------------------------------------------------------------------------------------

const getRecordingDurationMinutes = async (recordingId: string) => {
  const snapshot = await recordingsCollection().doc(recordingId).get();
  const data = snapshot.data() as
    | { audio?: { durationSeconds?: unknown } }
    | undefined;
  const durationSeconds = data?.audio?.durationSeconds;

  if (typeof durationSeconds !== "number") {
    return 0;
  }

  return durationSeconds / 60;
};

//----------------------------------------------------------------------------------------------------------------

export const handleTranscribeRecording = async (data: RecordingJobData) => {
  const docRef = recordingsCollection().doc(data.recordingId);
  const audioUrl = await getDeepgramAudioUrl(data.recordingId);

  await docRef.update({
    status: "transcribing",
    "search.embeddingStatus": "transcribing",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const transcription = await transcribeAudioUrl({
    audioUrl,
    smartFormat: true,
    diarize: true,
    punctuate: true,
  });

  await saveTranscriptSegments(
    transcription.raw,
    data.userId,
    data.recordingId,
  );

  await incrementUsageMetrics({
    userId: data.userId,
    transcriptionMinutes: await getRecordingDurationMinutes(data.recordingId),
  });

  await docRef.update({
    status: "transcribed",
    "transcript.fullText": transcription.transcript,
    "transcript.language": "",
    "transcript.wordCount": getWordCount(transcription.transcript),
    "transcript.provider": "deepgram",
    "transcript.deepgramRequestId": getDeepgramRequestId(transcription.raw),
    "transcript.transcribedAt": admin.firestore.FieldValue.serverTimestamp(),
    "search.embeddingStatus": "transcribed",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await enqueueSummarizeRecording(data);
};

//----------------------------------------------------------------------------------------------------------------

export const handleSummarizeRecording = async (data: RecordingJobData) => {
  const docRef = recordingsCollection().doc(data.recordingId);

  await docRef.update({
    status: "summarizing",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const transcript = await getTranscriptText(data.recordingId);
  const summary = await generateRecordingSummary(transcript);

  await incrementUsageMetrics({
    userId: data.userId,
    aiRequestCount: 1,
  });

  await docRef.update({
    "ai.summary": summary.summary,
    "ai.shortSummary": summary.shortSummary,
    "ai.keyPoints": summary.keyPoints,
    "ai.decisions": summary.decisions,
    "ai.actionItems": summary.actionItems,
    "ai.generatedAt": admin.firestore.FieldValue.serverTimestamp(),
    "ai.model": process.env.XAI_CHAT_MODEL ?? "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await enqueueEmbedRecording(data);
};

//----------------------------------------------------------------------------------------------------------------

export const handleEmbedRecording = async (data: RecordingJobData) => {
  await recordingsCollection().doc(data.recordingId).update({
    status: "embedding",
    "search.embeddingStatus": "embedding",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const transcript = await getTranscriptText(data.recordingId);
  const embeddings = await generateTranscriptEmbeddings(transcript);

  await incrementUsageMetrics({
    userId: data.userId,
    aiRequestCount: 1,
  });

  const stored = await storeRecordingEmbeddings({
    recordingId: data.recordingId,
    userId: data.userId,
    embeddings,
  });
  await saveTranscriptChunks({
    recordingId: data.recordingId,
    userId: data.userId,
    embeddings,
  });

  await recordingsCollection().doc(data.recordingId).update({
    status: "completed",
    "search.embeddingStatus": "completed",
    "search.vectorCollection": stored.collectionName,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};
