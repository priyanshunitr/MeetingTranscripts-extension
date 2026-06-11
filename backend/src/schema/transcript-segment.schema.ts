import { z } from "zod";
import { TimestampSchema } from "./firestore.schema";

export const TranscriptWordSchema = z.object({
  word: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
});

export const TranscriptSegmentSchema = z.object({
  userId: z.string(),
  recordingId: z.string(),
  speaker: z.string(),
  speakerLabel: z.string(),
  text: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  words: z.array(TranscriptWordSchema),
  createdAt: TimestampSchema,
});

export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
