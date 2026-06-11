import { createHash, createHmac, randomUUID } from "node:crypto";
import { ApiError } from "../utils/ApiError.js";

type S3Config = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  bucket: string;
};

type CreateSignedUploadUrlInput = {
  userId: string;
  recordingId: string;
  fileName: string;
  mimeType: string;
  expiresInSeconds: number;
};

type CreateSignedDownloadUrlInput = {
  s3Key: string;
  expiresInSeconds?: number;
};

type CreateSignedS3UrlInput = {
  config: S3Config;
  method: "GET" | "PUT";
  s3Key: string;
  expiresInSeconds: number;
  signedHeaders: string;
  canonicalHeaders: string[];
};

const getS3Config = (): S3Config => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!accessKeyId || !secretAccessKey || !region || !bucket) {
    throw new ApiError(500, "AWS S3 environment variables are not configured");
  }

  const config: S3Config = {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
  };

  if (process.env.AWS_SESSION_TOKEN) {
    config.sessionToken = process.env.AWS_SESSION_TOKEN;
  }

  return config;
};

//----------------------------------------------------------------------------------------------------------------

const hmac = (key: string | Buffer, value: string) => {
  return createHmac("sha256", key).update(value).digest();
};

//----------------------------------------------------------------------------------------------------------------

const hash = (value: string) => {
  return createHash("sha256").update(value).digest("hex");
};

//----------------------------------------------------------------------------------------------------------------

const toAmzDate = (date: Date) => {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
};

//----------------------------------------------------------------------------------------------------------------

const sanitizeFileName = (fileName: string) => {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
};

//----------------------------------------------------------------------------------------------------------------

const encodeS3Path = (value: string) => {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
};

//----------------------------------------------------------------------------------------------------------------

const getS3Host = (config: S3Config) => {
  return `${config.bucket}.s3.${config.region}.amazonaws.com`;
};

//----------------------------------------------------------------------------------------------------------------

const getS3ObjectUrl = (config: S3Config, s3Key: string) => {
  return `https://${getS3Host(config)}/${encodeS3Path(s3Key)}`;
};

//----------------------------------------------------------------------------------------------------------------

const getSigningKey = (
  secretAccessKey: string,
  dateStamp: string,
  region: string,
) => {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
};

//----------------------------------------------------------------------------------------------------------------

const createSignedS3Url = (input: CreateSignedS3UrlInput) => {
  const { config } = input;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const host = getS3Host(config);
  const canonicalUri = `/${encodeS3Path(input.s3Key)}`;
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": input.signedHeaders,
  });

  if (config.sessionToken) {
    queryParams.set("X-Amz-Security-Token", config.sessionToken);
  }

  queryParams.sort();

  const canonicalRequest = [
    input.method,
    canonicalUri,
    queryParams.toString(),
    ...input.canonicalHeaders,
    "",
    input.signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    getSigningKey(config.secretAccessKey, dateStamp, config.region),
  )
    .update(stringToSign)
    .digest("hex");

  queryParams.set("X-Amz-Signature", signature);

  return `https://${host}${canonicalUri}?${queryParams.toString()}`;
};

//----------------------------------------------------------------------------------------------------------------

// Generates a presigned S3 PUT URL for direct frontend audio uploads.
export const createSignedUploadUrl = (input: CreateSignedUploadUrlInput) => {
  const config = getS3Config();
  const host = getS3Host(config);
  const sanitizedFileName = sanitizeFileName(input.fileName);
  const s3Key = `users/${input.userId}/recordings/${input.recordingId}/${randomUUID()}-${sanitizedFileName}`;
  const uploadUrl = createSignedS3Url({
    config,
    method: "PUT",
    s3Key,
    expiresInSeconds: input.expiresInSeconds,
    signedHeaders: "content-type;host",
    canonicalHeaders: [`content-type:${input.mimeType}`, `host:${host}`],
  });

  return {
    uploadUrl,
    fileUrl: getS3ObjectUrl(config, s3Key),
    s3Key,
    bucket: config.bucket,
    method: "PUT",
    headers: {
      "Content-Type": input.mimeType,
    },
    expiresInSeconds: input.expiresInSeconds,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Generates a presigned S3 GET URL so private audio can be read by Deepgram.
export const createSignedDownloadUrl = (input: CreateSignedDownloadUrlInput) => {
  const config = getS3Config();
  const host = getS3Host(config);
  const expiresInSeconds = input.expiresInSeconds ?? 3600;

  return createSignedS3Url({
    config,
    method: "GET",
    s3Key: input.s3Key,
    expiresInSeconds,
    signedHeaders: "host",
    canonicalHeaders: [`host:${host}`],
  });
};
