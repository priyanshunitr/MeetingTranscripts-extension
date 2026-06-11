import { admin, firestore } from "../lib/firestore";
import { TRANSCRIPT_CHUNKS_COLLECTION } from "../models/transcript-chunk.model";
import type { TranscriptEmbedding } from "./embedding.services";
import { getRecordingChunkVectorId } from "./qdrant.services";

type SaveTranscriptChunksInput = {
  userId: string;
  recordingId: string;
  embeddings: TranscriptEmbedding[];
};

const extractSpeakerNames = (text: string) => {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/\bSpeaker\s+\d+\b/g)).map(
        (match) => match[0],
      ),
    ),
  );
};

//----------------------------------------------------------------------------------------------------------------

// Saves transcript chunks under recordings/{recordingId}/chunks with vector metadata.
export const saveTranscriptChunks = async (input: SaveTranscriptChunksInput) => {
  if (!input.embeddings.length) {
    return {
      savedCount: 0,
    };
  }

  const collectionRef = firestore
    .collection("recordings")
    .doc(input.recordingId)
    .collection(TRANSCRIPT_CHUNKS_COLLECTION);

  for (let index = 0; index < input.embeddings.length; index += 450) {
    const batch = firestore.batch();
    const batchChunks = input.embeddings.slice(index, index + 450);

    batchChunks.forEach((chunk) => {
      const vectorId = getRecordingChunkVectorId(
        input.recordingId,
        chunk.chunkIndex,
      );
      const docRef = collectionRef.doc(`chunk_${chunk.chunkIndex}`);

      batch.set(docRef, {
        userId: input.userId,
        recordingId: input.recordingId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        startTime: 0,
        endTime: 0,
        speakerNames: extractSpeakerNames(chunk.text),
        tokenCount: chunk.tokenCount,
        embedding: {
          provider: chunk.provider,
          model: chunk.model,
          vectorId,
          storedInVectorDb: true,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
  }

  return {
    savedCount: input.embeddings.length,
  };
};
