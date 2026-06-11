import type {
  DeepgramTranscribeUrlInput,
  DeepgramTranscriptionOptions,
} from "../schema/deepgram.schema";
import { ApiError } from "../utils/ApiError.js";

const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";

type DeepgramTranscriptionResult = {
  transcript: string;
  raw: unknown;
};

const getDeepgramApiKey = () => {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new ApiError(500, "DEEPGRAM_API_KEY is not configured");
  }

  return apiKey;
};

//----------------------------------------------------------------------------------------------------------------

const appendDeepgramOptions = (
  url: URL,
  options: DeepgramTranscriptionOptions,
) => {
  url.searchParams.set("model", options.model ?? "nova-3");
  url.searchParams.set("smart_format", String(options.smartFormat ?? true));
  url.searchParams.set("diarize", String(options.diarize ?? true));
  url.searchParams.set("punctuate", String(options.punctuate ?? true));

  if (options.language) {
    url.searchParams.set("language", options.language);
  }
};

//----------------------------------------------------------------------------------------------------------------

type DeepgramWord = {
  word?: string;
  punctuated_word?: string;
  speaker?: number | string;
};

type DeepgramParagraph = {
  text?: string;
  speaker?: number | string;
};

type DeepgramAlternative = {
  transcript?: string;
  words?: DeepgramWord[];
  paragraphs?: {
    paragraphs?: DeepgramParagraph[];
  };
};

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

const formatWordsAsConversation = (words: DeepgramWord[]) => {
  const segments: string[] = [];
  let currentSpeaker: number | string | undefined;
  let currentWords: string[] = [];

  const flush = () => {
    if (!currentWords.length) return;

    segments.push(`${getSpeakerName(currentSpeaker)}: ${currentWords.join(" ")}`);
    currentWords = [];
  };

  words.forEach((word) => {
    const text = word.punctuated_word ?? word.word ?? "";

    if (!text) return;

    if (currentWords.length && word.speaker !== currentSpeaker) {
      flush();
    }

    currentSpeaker = word.speaker;
    currentWords.push(text);
  });

  flush();

  return segments.join("\n\n");
};

//----------------------------------------------------------------------------------------------------------------

const formatParagraphsAsConversation = (paragraphs: DeepgramParagraph[]) => {
  return paragraphs
    .filter((paragraph) => paragraph.text?.trim())
    .map((paragraph) => `${getSpeakerName(paragraph.speaker)}: ${paragraph.text?.trim()}`)
    .join("\n\n");
};

//----------------------------------------------------------------------------------------------------------------

const extractTranscript = (response: unknown) => {
  const result = response as {
    results?: {
      channels?: Array<{
        alternatives?: DeepgramAlternative[];
      }>;
    };
  };
  const alternative = result.results?.channels?.[0]?.alternatives?.[0];
  const paragraphs = alternative?.paragraphs?.paragraphs ?? [];
  const paragraphTranscript = formatParagraphsAsConversation(paragraphs);

  if (paragraphTranscript) {
    return paragraphTranscript;
  }

  const wordTranscript = formatWordsAsConversation(alternative?.words ?? []);

  if (wordTranscript) {
    return wordTranscript;
  }

  return alternative?.transcript?.trim() ?? "";
};

//----------------------------------------------------------------------------------------------------------------

const parseDeepgramResponse = async (
  response: Response,
): Promise<DeepgramTranscriptionResult> => {
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    const error = data as { err_msg?: string; message?: string };
    throw new ApiError(
      response.status,
      error.err_msg || error.message || "Deepgram transcription failed",
      [data],
    );
  }

  return {
    transcript: extractTranscript(data),
    raw: data,
  };
};

//----------------------------------------------------------------------------------------------------------------

// Sends an audio file URL to Deepgram and returns the transcript plus raw provider response.
export const transcribeAudioUrl = async (
  input: DeepgramTranscribeUrlInput,
) => {
  const url = new URL(DEEPGRAM_LISTEN_URL);
  appendDeepgramOptions(url, input);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${getDeepgramApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: input.audioUrl,
    }),
  });

  return parseDeepgramResponse(response);
};
