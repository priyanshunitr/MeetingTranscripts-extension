import admin from "firebase-admin";
import dotenv from "dotenv";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

type ServiceAccount = admin.ServiceAccount;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../..");

const resolveServiceAccountPath = (rawPath: string) => {
  const candidates = [
    path.resolve(process.cwd(), rawPath),
    path.resolve(backendRoot, rawPath),
    path.resolve(__dirname, "..", rawPath),
    path.resolve(backendRoot, path.basename(rawPath)),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`Firebase service account file not found: ${rawPath}`);
  }

  return resolved;
};

const loadServiceAccount = (): ServiceAccount => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch {
      const serviceAccountPath = resolveServiceAccountPath(raw);
      return JSON.parse(readFileSync(serviceAccountPath, "utf8")) as ServiceAccount;
    }
  }

  const serviceAccountPath = resolveServiceAccountPath("serviceAccountKey.json");
  return JSON.parse(readFileSync(serviceAccountPath, "utf8")) as ServiceAccount;
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(loadServiceAccount()),
  });
}

const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID?.trim();

export const firestore =
  firestoreDatabaseId && firestoreDatabaseId !== "(default)"
    ? getFirestore(admin.app(), firestoreDatabaseId)
    : admin.firestore();
export { admin };
