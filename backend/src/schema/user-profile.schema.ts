import { z } from "zod";
import { TimestampSchema } from "./firestore.schema";

export const AuthProviderSchema = z.enum(["google", "apple", "email"]);

export const UserSettingsSchema = z.object({
  language: z.string(),
  autoSummary: z.boolean(),
  autoActionItems: z.boolean(),
  defaultRecordingTitle: z.string(),
});

export const UserUsageMetricsSchema = z.object({
  plan: z.string(),
  recordingMinutes: z.number().nonnegative(),
  transcriptionMinutes: z.number().nonnegative(),
  storageBytes: z.number().int().nonnegative(),
  aiRequestCount: z.number().int().nonnegative(),
  updatedAt: TimestampSchema,
});

export const UserProfileSchema = z.object({
  uid: z.string(),
  name: z.string(),
  email: z.string().email(),
  authProvider: AuthProviderSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  settings: UserSettingsSchema,
  usage: UserUsageMetricsSchema,
});

export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type UserUsageMetrics = z.infer<typeof UserUsageMetricsSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
