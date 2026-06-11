import { admin, firestore } from "../lib/firestore";
import { getDefaultUsageMetrics } from "./usage.services";

export type AppUser = {
  id: string;
  uid?: string;
  email: string;
  name: string;
  authProvider?: string;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
};

const usersCollection = () => firestore.collection("users");

const toUser = (snapshot: FirebaseFirestore.DocumentSnapshot): AppUser | null => {
  if (!snapshot.exists) return null;

  const data = snapshot.data() as Omit<AppUser, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
};
// ---------------------------------------------------------------------------------------------------------

// Finds a user document by normalized email address.
export const findUserByEmail = async (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const snapshot = await usersCollection()
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const [userDoc] = snapshot.docs;
  return userDoc ? toUser(userDoc) : null;
};
// ---------------------------------------------------------------------------------------------------------

// Finds a user document by Firestore document ID.
export const findUserById = async (id: string) => {
  const snapshot = await usersCollection().doc(id).get();
  return toUser(snapshot);
};
// ---------------------------------------------------------------------------------------------------------

// Creates a new user document from Firebase Auth profile data.
export const createUser = async (input: {
  uid?: string;
  email: string;
  name: string;
  authProvider?: string;
}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = input.uid ? usersCollection().doc(input.uid) : usersCollection().doc();
  const user = {
    uid: input.uid ?? docRef.id,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    authProvider: input.authProvider ?? "firebase",
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(user);

  return {
    id: docRef.id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider,
  };
};

// Creates or updates the Firestore user profile from a verified Firebase token.
export const syncFirebaseUser = async (input: {
  uid: string;
  email?: string;
  name?: string;
  authProvider?: string;
}) => {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = usersCollection().doc(input.uid);
  const snapshot = await docRef.get();
  const user = {
    uid: input.uid,
    email: input.email?.trim().toLowerCase() ?? "",
    name: input.name?.trim() || input.email?.split("@")[0] || "User",
    authProvider: input.authProvider ?? "firebase",
    updatedAt: now,
  };

  if (snapshot.exists) {
    await docRef.set(user, { merge: true });
  } else {
    await docRef.set({
      ...user,
      settings: {
        language: "en",
        autoSummary: true,
        autoActionItems: true,
        defaultRecordingTitle: "Untitled Recording",
      },
      usage: getDefaultUsageMetrics(),
      createdAt: now,
    });
  }

  return findUserById(input.uid);
};
