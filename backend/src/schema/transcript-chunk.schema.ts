import { z } from "zod";
import { TimestampSchema } from "./firestore.schema";

export const TranscriptChunkEmbeddingSchema = z.object({
  provider: z.string(),
  model: z.string(),
  vectorId: z.string(),
  storedInVectorDb: z.boolean(),
});

export const TranscriptChunkSchema = z.object({
  userId: z.string(),
  recordingId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string(),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  speakerNames: z.array(z.string()),
  tokenCount: z.number().int().nonnegative(),
  embedding: TranscriptChunkEmbeddingSchema,
  createdAt: TimestampSchema,
});

export type TranscriptChunkEmbedding = z.infer<
  typeof TranscriptChunkEmbeddingSchema
>;
export type TranscriptChunk = z.infer<typeof TranscriptChunkSchema>;
