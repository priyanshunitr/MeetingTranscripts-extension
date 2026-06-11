import { createHash } from "node:crypto";
import type { TranscriptEmbedding } from "./embedding.services";
import { ApiError } from "../utils/ApiError.js";

type QdrantConfig = {
  baseUrl: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
};

type StoreRecordingEmbeddingsInput = {
  recordingId: string;
  userId: string;
  embeddings: TranscriptEmbedding[];
};

export type RetrievedRecordingChunk = {
  recordingId: string;
  chunkId: string;
  text: string;
  startTime: number;
  endTime: number;
  textPreview: string;
  score: number;
};

const getQdrantConfig = (): QdrantConfig => {
  const baseUrl = process.env.QDRANT_URL;
  const collectionName =
    process.env.QDRANT_COLLECTION_NAME ?? "recording_chunks";
  const vectorSize = Number(process.env.QDRANT_VECTOR_SIZE);

  if (!baseUrl) {
    throw new ApiError(500, "QDRANT_URL is not configured");
  }

  if (!Number.isInteger(vectorSize) || vectorSize <= 0) {
    throw new ApiError(500, "QDRANT_VECTOR_SIZE is not configured");
  }

  const config: QdrantConfig = {
    baseUrl: baseUrl.replace(/\/$/, ""),
    collectionName,
    vectorSize,
  };

  if (process.env.QDRANT_API_KEY) {
    config.apiKey = process.env.QDRANT_API_KEY;
  }

  return config;
};

//----------------------------------------------------------------------------------------------------------------

const getHeaders = (config: QdrantConfig) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["api-key"] = config.apiKey;
  }

  return headers;
};

//----------------------------------------------------------------------------------------------------------------

// Creates a deterministic UUID-compatible vector ID for a recording chunk.
export const getRecordingChunkVectorId = (
  recordingId: string,
  chunkIndex: number,
) => {
  const hash = createHash("sha256")
    .update(`${recordingId}:${chunkIndex}`)
    .digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(
    12,
    16,
  )}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

//----------------------------------------------------------------------------------------------------------------

const qdrantRequest = async (
  path: string,
  init: RequestInit,
  config = getQdrantConfig(),
) => {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...getHeaders(config),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(
      response.status,
      body || "Qdrant request failed",
    );
  }

  return response;
};

//----------------------------------------------------------------------------------------------------------------

// Ensures the configured Qdrant collection exists before vectors are stored.
export const ensureQdrantCollection = async () => {
  const config = getQdrantConfig();

  await qdrantRequest(
    `/collections/${encodeURIComponent(config.collectionName)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: config.vectorSize,
          distance: "Cosine",
        },
      }),
    },
    config,
  );

  return config.collectionName;
};

//----------------------------------------------------------------------------------------------------------------

// Stores recording chunk embeddings in Qdrant with searchable payload metadata.
export const storeRecordingEmbeddings = async (
  input: StoreRecordingEmbeddingsInput,
) => {
  const config = getQdrantConfig();
  await ensureQdrantCollection();

  const points = input.embeddings.map((chunk) => ({
    id: getRecordingChunkVectorId(input.recordingId, chunk.chunkIndex),
    vector: chunk.embedding,
    payload: {
      userId: input.userId,
      recordingId: input.recordingId,
      chunkId: `chunk_${chunk.chunkIndex}`,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startTime: 0,
      endTime: 0,
      tokenCount: chunk.tokenCount,
      provider: chunk.provider,
      model: chunk.model,
    },
  }));

  await qdrantRequest(
    `/collections/${encodeURIComponent(config.collectionName)}/points`,
    {
      method: "PUT",
      body: JSON.stringify({
        points,
      }),
    },
    config,
  );

  return {
    collectionName: config.collectionName,
    storedCount: points.length,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Searches Qdrant for relevant chunks from one recording using a query embedding.
export const searchRecordingChunks = async (input: {
  userId: string;
  recordingId: string;
  queryEmbedding: number[];
  limit?: number;
}) => {
  const config = getQdrantConfig();
  const response = await qdrantRequest(
    `/collections/${encodeURIComponent(config.collectionName)}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector: input.queryEmbedding,
        limit: input.limit ?? 5,
        with_payload: true,
        filter: {
          must: [
            {
              key: "userId",
              match: {
                value: input.userId,
              },
            },
            {
              key: "recordingId",
              match: {
                value: input.recordingId,
              },
            },
          ],
        },
      }),
    },
    config,
  );

  const data = (await response.json()) as {
    result?: Array<{
      score?: number;
      payload?: {
        chunkId?: string;
        chunkIndex?: number;
        text?: string;
        startTime?: number;
        endTime?: number;
      };
    }>;
  };

  return (
    data.result?.map((item) => {
      const text = item.payload?.text ?? "";
      const chunkId =
        item.payload?.chunkId ?? `chunk_${item.payload?.chunkIndex ?? 0}`;

      return {
        recordingId: input.recordingId,
        chunkId,
        text,
        startTime: item.payload?.startTime ?? 0,
        endTime: item.payload?.endTime ?? 0,
        textPreview: text.slice(0, 180),
        score: item.score ?? 0,
      };
    }) ?? []
  );
};

//----------------------------------------------------------------------------------------------------------------

// Searches Qdrant for relevant chunks across all recordings owned by one user.
export const searchUserChunks = async (input: {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
}) => {
  const config = getQdrantConfig();
  const response = await qdrantRequest(
    `/collections/${encodeURIComponent(config.collectionName)}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector: input.queryEmbedding,
        limit: input.limit ?? 10,
        with_payload: true,
        filter: {
          must: [
            {
              key: "userId",
              match: {
                value: input.userId,
              },
            },
          ],
        },
      }),
    },
    config,
  );

  const data = (await response.json()) as {
    result?: Array<{
      score?: number;
      payload?: {
        recordingId?: string;
        chunkId?: string;
        chunkIndex?: number;
        text?: string;
        startTime?: number;
        endTime?: number;
      };
    }>;
  };

  return (
    data.result?.map((item) => {
      const text = item.payload?.text ?? "";
      const chunkId =
        item.payload?.chunkId ?? `chunk_${item.payload?.chunkIndex ?? 0}`;

      return {
        recordingId: item.payload?.recordingId ?? "",
        chunkId,
        text,
        startTime: item.payload?.startTime ?? 0,
        endTime: item.payload?.endTime ?? 0,
        textPreview: text.slice(0, 180),
        score: item.score ?? 0,
      };
    }) ?? []
  );
};

//----------------------------------------------------------------------------------------------------------------

// Best-effort cleanup for vectors belonging to a soft-deleted recording.
export const deleteRecordingVectors = async (input: {
  userId: string;
  recordingId: string;
}) => {
  const config = getQdrantConfig();

  await qdrantRequest(
    `/collections/${encodeURIComponent(config.collectionName)}/points/delete`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: "userId",
              match: {
                value: input.userId,
              },
            },
            {
              key: "recordingId",
              match: {
                value: input.recordingId,
              },
            },
          ],
        },
      }),
    },
    config,
  );
};
