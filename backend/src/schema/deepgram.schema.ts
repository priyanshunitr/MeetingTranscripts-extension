import { z } from "zod";

export const DeepgramTranscriptionOptionsSchema = z.object({
  model: z.string().optional(),
  language: z.string().optional(),
  smartFormat: z.boolean().optional(),
  diarize: z.boolean().optional(),
  punctuate: z.boolean().optional(),
});

export const DeepgramTranscribeUrlSchema =
  DeepgramTranscriptionOptionsSchema.extend({
    audioUrl: z.string().url(),
  });

export type DeepgramTranscriptionOptions = z.infer<
  typeof DeepgramTranscriptionOptionsSchema
>;
export type DeepgramTranscribeUrlInput = z.infer<
  typeof DeepgramTranscribeUrlSchema
>;
