import { z } from "zod";

export const SummaryActionItemSchema = z.object({
  task: z.string(),
  owner: z.string().default(""),
  dueDate: z.string().default(""),
  status: z.enum(["pending", "completed"]).default("pending"),
});

export const RecordingSummarySchema = z.object({
  summary: z.string(),
  shortSummary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(SummaryActionItemSchema),
});

export type SummaryActionItem = z.infer<typeof SummaryActionItemSchema>;
export type RecordingSummary = z.infer<typeof RecordingSummarySchema>;
