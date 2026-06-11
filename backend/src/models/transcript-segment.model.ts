export type TranscriptWord = {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
};

export type TranscriptSegmentModel = {
  userId: string;
  recordingId: string;
  speaker: string;
  speakerLabel: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  words: TranscriptWord[];
  createdAt: FirebaseFirestore.Timestamp;
};

export const TRANSCRIPT_SEGMENTS_COLLECTION = "segments";
