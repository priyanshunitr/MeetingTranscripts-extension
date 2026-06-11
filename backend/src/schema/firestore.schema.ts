import { z } from "zod";

export const TimestampSchema = z.custom<FirebaseFirestore.Timestamp>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function",
  "Expected Firebase Firestore Timestamp",
);

export const NullableTimestampSchema = TimestampSchema.nullable();
