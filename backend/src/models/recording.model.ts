export type RecordingType =
  | "meeting"
  | "lecture"
  | "interview"
  | "voice_note"
  | "call";

export type RecordingStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "summarizing"
  | "embedding"
  | "completed"
  | "failed";

export type ActionItemStatus = "pending" | "completed";

export type RecordingAudio = {
  s3Key: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  durationSeconds: number;
  uploadedAt: FirebaseFirestore.Timestamp;
};

export type RecordingTranscript = {
  fullText: string;
  language: string;
  wordCount: number;
  provider: string;
  deepgramRequestId: string;
  transcribedAt: FirebaseFirestore.Timestamp;
};

export type ActionItem = {
  task: string;
  owner: string;
  dueDate: string;
  status: ActionItemStatus;
};

export type RecordingAi = {
  summary: string;
  shortSummary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  generatedAt: FirebaseFirestore.Timestamp;
  model: string;
};

export type RecordingSearch = {
  keywords: string[];
  embeddingStatus: RecordingStatus;
  vectorNamespace: string;
  vectorCollection: string;
};

export type RecordingStats = {
  chatCount: number;
  aiRequestCount: number;
  viewCount: number;
};

export type RecordingError = {
  message: string;
  stage: string;
  code: string;
};

export type RecordingModel = {
  userId: string;
  title: string;
  description: string;
  type: RecordingType;
  status: RecordingStatus;
  audio: RecordingAudio;
  transcript: RecordingTranscript;
  ai: RecordingAi;
  search: RecordingSearch;
  stats: RecordingStats;
  error: RecordingError;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  deletedAt: FirebaseFirestore.Timestamp | null;
};

export const RECORDINGS_COLLECTION = "recordings";
