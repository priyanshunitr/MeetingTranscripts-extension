import { beforeEach, describe, expect, it, vi } from "vitest";

const { transcribeAudioUrl } = await import("../src/services/deepgram.services");

describe("transcribeAudioUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DEEPGRAM_API_KEY = "deepgram_test_key";
  });

  //----------------------------------------------------------------------------------------------------------------

  it("formats diarized words as a speaker-labeled conversation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: "hello there yes agreed",
                      words: [
                        {
                          punctuated_word: "Hello",
                          speaker: 0,
                        },
                        {
                          punctuated_word: "there.",
                          speaker: 0,
                        },
                        {
                          punctuated_word: "Yes",
                          speaker: 1,
                        },
                        {
                          punctuated_word: "agreed.",
                          speaker: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await transcribeAudioUrl({
      audioUrl: "https://s3.test/audio.webm",
      diarize: true,
    });

    expect(result.transcript).toBe("Speaker 1: Hello there.\n\nSpeaker 2: Yes agreed.");
  });
});
