import { z } from "zod";
import { NullableTimestampSchema, TimestampSchema } from "./firestore.schema";

export const RecordingTypeSchema = z.enum([
  "meeting",
  "lecture",
  "interview",
  "voice_note",
  "call",
]);

export const RecordingStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "transcribing",
  "transcribed",
  "summarizing",
  "embedding",
  "completed",
  "failed",
]);

export const ActionItemStatusSchema = z.enum(["pending", "completed"]);

export const RecordingAudioSchema = z.object({
  s3Key: z.string(),
  fileUrl: z.string().url(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  uploadedAt: TimestampSchema,
});

export const RecordingTranscriptSchema = z.object({
  fullText: z.string(),
  language: z.string(),
  wordCount: z.number().int().nonnegative(),
  provider: z.string(),
  deepgramRequestId: z.string(),
  transcribedAt: TimestampSchema,
});

export const ActionItemSchema = z.object({
  task: z.string(),
  owner: z.string(),
  dueDate: z.string(),
  status: ActionItemStatusSchema,
});

export const RecordingAiSchema = z.object({
  summary: z.string(),
  shortSummary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(ActionItemSchema),
  generatedAt: TimestampSchema,
  model: z.string(),
});

export const RecordingSearchSchema = z.object({
  keywords: z.array(z.string()),
  embeddingStatus: RecordingStatusSchema,
  vectorNamespace: z.string(),
  vectorCollection: z.string(),
});

export const RecordingStatsSchema = z.object({
  chatCount: z.number().int().nonnegative(),
  aiRequestCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
});

export const RecordingErrorSchema = z.object({
  message: z.string(),
  stage: z.string(),
  code: z.string(),
});

export const RecordingSchema = z.object({
  userId: z.string(),
  title: z.string(),
  description: z.string(),
  type: RecordingTypeSchema,
  status: RecordingStatusSchema,
  audio: RecordingAudioSchema,
  transcript: RecordingTranscriptSchema,
  ai: RecordingAiSchema,
  search: RecordingSearchSchema,
  stats: RecordingStatsSchema,
  error: RecordingErrorSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: NullableTimestampSchema,
});

export const CreateRecordingAudioSchema = z.object({
  s3Key: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
});

export const CreateRecordingSchema = z.object({
  title: z.string().min(1).default("Untitled Recording"),
  description: z.string().default(""),
  type: RecordingTypeSchema.default("meeting"),
  audio: CreateRecordingAudioSchema.optional(),
});

export const UpdateRecordingSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    type: RecordingTypeSchema.optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).some((key) => value[key as keyof typeof value] !== undefined),
    "At least one field is required",
  );

export const RecordingQuerySchema = z.object({});

export const RecordingSearchQuerySchema = z.object({
  q: z.string().min(1),
  mode: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid"),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const CreateRecordingUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  expiresInSeconds: z.number().int().min(60).max(604800).default(900),
});

export const CompleteRecordingUploadSchema = z.object({
  fileSize: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
});

export const CompleteRecordingBrowserTranscriptSchema = z.object({
  fileSize: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  transcript: z.string().min(1),
  language: z.string().min(1).default("en-US"),
});

export type RecordingType = z.infer<typeof RecordingTypeSchema>;
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;
export type ActionItemStatus = z.infer<typeof ActionItemStatusSchema>;
export type RecordingAudio = z.infer<typeof RecordingAudioSchema>;
export type RecordingTranscript = z.infer<typeof RecordingTranscriptSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type RecordingAi = z.infer<typeof RecordingAiSchema>;
export type RecordingSearch = z.infer<typeof RecordingSearchSchema>;
export type RecordingStats = z.infer<typeof RecordingStatsSchema>;
export type RecordingError = z.infer<typeof RecordingErrorSchema>;
export type Recording = z.infer<typeof RecordingSchema>;
export type CreateRecordingInput = z.infer<typeof CreateRecordingSchema>;
export type UpdateRecordingInput = z.infer<typeof UpdateRecordingSchema>;
export type RecordingSearchQuery = z.infer<typeof RecordingSearchQuerySchema>;
export type CreateRecordingUploadUrlInput = z.infer<
  typeof CreateRecordingUploadUrlSchema
>;
export type CompleteRecordingUploadInput = z.infer<
  typeof CompleteRecordingUploadSchema
>;
export type CompleteRecordingBrowserTranscriptInput = z.infer<
  typeof CompleteRecordingBrowserTranscriptSchema
>;
