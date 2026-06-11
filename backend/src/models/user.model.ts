export type AuthProvider = "google" | "apple" | "email";

export type UserSettings = {
  language: string;
  autoSummary: boolean;
  autoActionItems: boolean;
  defaultRecordingTitle: string;
};

export type UserUsageMetrics = {
  plan: string;
  recordingMinutes: number;
  transcriptionMinutes: number;
  storageBytes: number;
  aiRequestCount: number;
  updatedAt: FirebaseFirestore.Timestamp;
};

export type UserModel = {
  uid: string;
  name: string;
  email: string;
  authProvider: AuthProvider;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  settings: UserSettings;
  usage: UserUsageMetrics;
};

export const USERS_COLLECTION = "users";
