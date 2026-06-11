import { Worker } from "bullmq";
import { admin, firestore } from "../lib/firestore";
import { RECORDINGS_COLLECTION } from "../models/recording.model";
import { redisConnection } from "./connection";
import {
  handleEmbedRecording,
  handleSummarizeRecording,
  handleTranscribeRecording,
} from "./recording.handlers";
import {
  RECORDING_JOBS,
  RECORDING_QUEUE_NAME,
  type RecordingJobData,
  type RecordingJobName,
} from "./recording.queue";

let recordingWorker: Worker<RecordingJobData, void, RecordingJobName> | null =
  null;

const markRecordingJobFailed = async (
  data: RecordingJobData | undefined,
  jobName: string,
  error: Error,
) => {
  if (!data) return;

  await firestore.collection(RECORDINGS_COLLECTION).doc(data.recordingId).update({
    status: "failed",
    "error.message": error.message,
    "error.stage": jobName,
    "error.code": "RECORDING_JOB_FAILED",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

//----------------------------------------------------------------------------------------------------------------

export const startRecordingWorker = () => {
  if (recordingWorker) {
    return recordingWorker;
  }

  recordingWorker = new Worker<RecordingJobData, void, RecordingJobName>(
    RECORDING_QUEUE_NAME,
    async (job) => {
      if (job.name === RECORDING_JOBS.transcribeRecording) {
        await handleTranscribeRecording(job.data);
        return;
      }

      if (job.name === RECORDING_JOBS.summarizeRecording) {
        await handleSummarizeRecording(job.data);
        return;
      }

      if (job.name === RECORDING_JOBS.embedRecording) {
        await handleEmbedRecording(job.data);
        return;
      }

      throw new Error(`Unsupported recording job: ${job.name}`);
    },
    {
      connection: redisConnection,
      concurrency: Number(process.env.RECORDING_WORKER_CONCURRENCY ?? 1),
    },
  );

  recordingWorker.on("failed", (job, error) => {
    void markRecordingJobFailed(job?.data, job?.name ?? "unknown", error);
  });

  return recordingWorker;
};
