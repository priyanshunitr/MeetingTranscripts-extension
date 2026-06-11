import { admin, firestore } from "../lib/firestore";

type UsageIncrementInput = {
  userId: string;
  recordingMinutes?: number;
  transcriptionMinutes?: number;
  storageBytes?: number;
  aiRequestCount?: number;
};

const usersCollection = () => firestore.collection("users");

//----------------------------------------------------------------------------------------------------------------

const incrementIfPresent = (
  updates: Record<string, FirebaseFirestore.FieldValue>,
  field: string,
  value: number | undefined,
) => {
  if (!value) return;

  updates[`usage.${field}`] = admin.firestore.FieldValue.increment(value);
};

//----------------------------------------------------------------------------------------------------------------

// Initializes usage metrics on a user profile for future subscription enforcement.
export const getDefaultUsageMetrics = () => {
  return {
    plan: "free",
    recordingMinutes: 0,
    transcriptionMinutes: 0,
    storageBytes: 0,
    aiRequestCount: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
};

//----------------------------------------------------------------------------------------------------------------

// Increments user-level usage counters for recordings, storage, transcription, and AI calls.
export const incrementUsageMetrics = async (input: UsageIncrementInput) => {
  const updates: Record<string, FirebaseFirestore.FieldValue> = {
    "usage.updatedAt": admin.firestore.FieldValue.serverTimestamp(),
  };

  incrementIfPresent(updates, "recordingMinutes", input.recordingMinutes);
  incrementIfPresent(
    updates,
    "transcriptionMinutes",
    input.transcriptionMinutes,
  );
  incrementIfPresent(updates, "storageBytes", input.storageBytes);
  incrementIfPresent(updates, "aiRequestCount", input.aiRequestCount);

  await usersCollection().doc(input.userId).set(updates, { merge: true });
};
