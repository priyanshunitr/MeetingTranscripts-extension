import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export const RECORDING_QUEUE_NAME = "recording-processing";

export const RECORDING_JOBS = {
  transcribeRecording: "transcribeRecording",
  summarizeRecording: "summarizeRecording",
  embedRecording: "embedRecording",
} as const;

export type RecordingJobName =
  (typeof RECORDING_JOBS)[keyof typeof RECORDING_JOBS];

export type RecordingJobData = {
  recordingId: string;
  userId: string;
};

let recordingQueue: Queue<RecordingJobData, void, RecordingJobName> | null = null;

const getRecordingQueue = () => {
  if (!recordingQueue) {
    recordingQueue = new Queue<RecordingJobData, void, RecordingJobName>(RECORDING_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
    });
  }

  return recordingQueue;
};

//----------------------------------------------------------------------------------------------------------------

export const enqueueTranscribeRecording = async (data: RecordingJobData) => {
  return getRecordingQueue().add(RECORDING_JOBS.transcribeRecording, data);
};

//----------------------------------------------------------------------------------------------------------------

export const enqueueSummarizeRecording = async (data: RecordingJobData) => {
  return getRecordingQueue().add(RECORDING_JOBS.summarizeRecording, data);
};

//----------------------------------------------------------------------------------------------------------------

export const enqueueEmbedRecording = async (data: RecordingJobData) => {
  return getRecordingQueue().add(RECORDING_JOBS.embedRecording, data);
};
