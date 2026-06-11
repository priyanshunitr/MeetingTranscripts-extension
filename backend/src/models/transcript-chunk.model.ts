export type TranscriptChunkEmbedding = {
  provider: string;
  model: string;
  vectorId: string;
  storedInVectorDb: boolean;
};

export type TranscriptChunkModel = {
  userId: string;
  recordingId: string;
  chunkIndex: number;
  text: string;
  startTime: number;
  endTime: number;
  speakerNames: string[];
  tokenCount: number;
  embedding: TranscriptChunkEmbedding;
  createdAt: FirebaseFirestore.Timestamp;
};

export const TRANSCRIPT_CHUNKS_COLLECTION = "chunks";
