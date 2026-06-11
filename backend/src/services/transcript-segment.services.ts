import { admin, firestore } from "../lib/firestore";
import {
  TRANSCRIPT_SEGMENTS_COLLECTION,
  type TranscriptWord,
} from "../models/transcript-segment.model";

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: number | string;
};

type DeepgramParagraph = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: number | string;
  num_words?: number;
  sentences?: Array<{
    text?: string;
    start?: number;
    end?: number;
  }>;
};

type DeepgramRawResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        words?: DeepgramWord[];
        paragraphs?: {
          paragraphs?: DeepgramParagraph[];
        };
      }>;
    }>;
  };
};

export type TranscriptSegmentInput = {
  userId: string;
  recordingId: string;
  speaker: string;
  speakerLabel: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  words: TranscriptWord[];
};

const getAlternative = (raw: unknown) => {
  const response = raw as DeepgramRawResponse;
  return response.results?.channels?.[0]?.alternatives?.[0];
};

//----------------------------------------------------------------------------------------------------------------

const getSpeakerName = (speaker: number | string | undefined) => {
  if (speaker === undefined || speaker === null || speaker === "") {
    return "Speaker 1";
  }

  const speakerNumber = Number(speaker);

  if (Number.isFinite(speakerNumber)) {
    return `Speaker ${speakerNumber + 1}`;
  }

  return `Speaker ${speaker}`;
};

//----------------------------------------------------------------------------------------------------------------

const toTranscriptWord = (word: DeepgramWord): TranscriptWord => {
  return {
    word: word.punctuated_word ?? word.word ?? "",
    startTime: word.start ?? 0,
    endTime: word.end ?? word.start ?? 0,
    confidence: word.confidence ?? 0,
  };
};

//----------------------------------------------------------------------------------------------------------------

const getAverageConfidence = (words: TranscriptWord[]) => {
  if (!words.length) return 0;

  const total = words.reduce((sum, word) => sum + word.confidence, 0);
  return total / words.length;
};

//----------------------------------------------------------------------------------------------------------------

const buildSegmentsFromWords = (
  userId: string,
  recordingId: string,
  words: DeepgramWord[],
) => {
  const segments: TranscriptSegmentInput[] = [];
  let currentSpeaker: number | string | undefined;
  let currentWords: TranscriptWord[] = [];

  const flush = () => {
    if (!currentWords.length) return;

    const speaker = getSpeakerName(currentSpeaker);
    const text = currentWords.map((word) => word.word).join(" ");

    segments.push({
      userId,
      recordingId,
      speaker,
      speakerLabel: speaker,
      text,
      startTime: currentWords[0]?.startTime ?? 0,
      endTime: currentWords[currentWords.length - 1]?.endTime ?? 0,
      confidence: getAverageConfidence(currentWords),
      words: currentWords,
    });

    currentWords = [];
  };

  words.forEach((word) => {
    if (currentWords.length && word.speaker !== currentSpeaker) {
      flush();
    }

    currentSpeaker = word.speaker;
    currentWords.push(toTranscriptWord(word));
  });

  flush();

  return segments;
};

//----------------------------------------------------------------------------------------------------------------

const buildSegmentsFromParagraphs = (
  userId: string,
  recordingId: string,
  paragraphs: DeepgramParagraph[],
) => {
  return paragraphs
    .filter((paragraph) => paragraph.text)
    .map((paragraph) => {
      const speaker = getSpeakerName(paragraph.speaker);

      return {
        userId,
        recordingId,
        speaker,
        speakerLabel: speaker,
        text: paragraph.text ?? "",
        startTime: paragraph.start ?? 0,
        endTime: paragraph.end ?? paragraph.start ?? 0,
        confidence: 0,
        words: [],
      };
    });
};

//----------------------------------------------------------------------------------------------------------------

// Extracts speaker-based transcript segments from Deepgram's raw transcription response.
export const extractDeepgramTranscriptSegments = (
  raw: unknown,
  userId: string,
  recordingId: string,
) => {
  const alternative = getAlternative(raw);
  const paragraphs = alternative?.paragraphs?.paragraphs ?? [];

  if (paragraphs.length) {
    return buildSegmentsFromParagraphs(userId, recordingId, paragraphs);
  }

  return buildSegmentsFromWords(userId, recordingId, alternative?.words ?? []);
};

//----------------------------------------------------------------------------------------------------------------

export const saveTranscriptSegmentInputs = async (
  recordingId: string,
  segments: TranscriptSegmentInput[],
) => {
  if (!segments.length) {
    return {
      savedCount: 0,
    };
  }

  const collectionRef = firestore
    .collection("recordings")
    .doc(recordingId)
    .collection(TRANSCRIPT_SEGMENTS_COLLECTION);

  for (let index = 0; index < segments.length; index += 450) {
    const batch = firestore.batch();
    const batchSegments = segments.slice(index, index + 450);

    batchSegments.forEach((segment, batchIndex) => {
      const segmentIndex = index + batchIndex;
      const docRef = collectionRef.doc(`segment_${segmentIndex}`);

      batch.set(docRef, {
        ...segment,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
  }

  return {
    savedCount: segments.length,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Saves transcript segments under recordings/{recordingId}/segments in Firestore.
export const saveTranscriptSegments = async (
  raw: unknown,
  userId: string,
  recordingId: string,
) => {
  const segments = extractDeepgramTranscriptSegments(raw, userId, recordingId);

  return saveTranscriptSegmentInputs(recordingId, segments);
};
