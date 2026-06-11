import { ApiError } from "../utils/ApiError.js";

export type TranscriptChunkInput = {
  chunkIndex: number;
  text: string;
  tokenCount: number;
};

export type TranscriptEmbedding = TranscriptChunkInput & {
  embedding: number[];
  provider: "openai";
  model: string;
};

type OpenAiEmbeddingResponse = {
  data?: Array<{
    index: number;
    embedding: number[];
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_CHUNK_WORDS = 700;
const DEFAULT_CHUNK_OVERLAP_WORDS = 80;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const getOpenAiEmbeddingConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_EMBEDDING_MODEL;

  if (!apiKey) {
    throw new ApiError(500, "OPENAI_API_KEY is not configured");
  }

  if (!model) {
    throw new ApiError(500, "OPENAI_EMBEDDING_MODEL is not configured");
  }

  return {
    apiKey,
    model,
    embeddingsUrl: `${
      process.env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL
    }/embeddings`,
  };
};

//----------------------------------------------------------------------------------------------------------------

const estimateTokenCount = (text: string) => {
  return Math.ceil(text.length / 4);
};

//----------------------------------------------------------------------------------------------------------------

// Splits a full transcript into overlapping text chunks for embedding generation.
export const splitTranscriptIntoChunks = (
  transcript: string,
  chunkWords = DEFAULT_CHUNK_WORDS,
  overlapWords = DEFAULT_CHUNK_OVERLAP_WORDS,
) => {
  const words = transcript.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [];
  }

  const chunks: TranscriptChunkInput[] = [];
  const step = Math.max(chunkWords - overlapWords, 1);

  for (let start = 0; start < words.length; start += step) {
    const chunkText = words.slice(start, start + chunkWords).join(" ");

    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      tokenCount: estimateTokenCount(chunkText),
    });

    if (start + chunkWords >= words.length) {
      break;
    }
  }

  return chunks;
};

//----------------------------------------------------------------------------------------------------------------

// Sends transcript chunks to OpenAI's embeddings API and returns vectors with chunk metadata.
export const generateEmbeddings = async (
  chunks: TranscriptChunkInput[],
): Promise<TranscriptEmbedding[]> => {
  if (!chunks.length) {
    return [];
  }

  const { apiKey, embeddingsUrl, model } = getOpenAiEmbeddingConfig();

  const response = await fetch(embeddingsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: chunks.map((chunk) => chunk.text),
    }),
  });

  const data = (await response.json()) as OpenAiEmbeddingResponse;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.message ?? "OpenAI embeddings request failed",
    );
  }

  const embeddingsByIndex = new Map(
    data.data?.map((item) => [item.index, item.embedding]) ?? [],
  );

  return chunks.map((chunk) => ({
    ...chunk,
    embedding: embeddingsByIndex.get(chunk.chunkIndex) ?? [],
    provider: "openai" as const,
    model,
  }));
};

//----------------------------------------------------------------------------------------------------------------

// Converts a full transcript into chunks and generates embeddings for each chunk.
export const generateTranscriptEmbeddings = async (transcript: string) => {
  const chunks = splitTranscriptIntoChunks(transcript);
  return generateEmbeddings(chunks);
};
