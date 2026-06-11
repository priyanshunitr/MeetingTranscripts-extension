import { ChatXAI, type ChatXAIInput } from "@langchain/xai";
import { RecordingSummarySchema } from "../schema/summary.schema";
import { ApiError } from "../utils/ApiError.js";

const getXaiChatConfig = () => {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_CHAT_MODEL;

  if (!apiKey) {
    throw new ApiError(500, "XAI_API_KEY is not configured");
  }

  if (!model) {
    throw new ApiError(500, "XAI_CHAT_MODEL is not configured");
  }

  return {
    apiKey,
    model,
    baseURL: process.env.XAI_BASE_URL,
  };
};

//----------------------------------------------------------------------------------------------------------------

const getTextContent = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (
          typeof item === "object" &&
          item !== null &&
          "text" in item &&
          typeof item.text === "string"
        ) {
          return item.text;
        }

        return "";
      })
      .join("");
  }

  return "";
};

//----------------------------------------------------------------------------------------------------------------

const extractJson = (content: string) => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1];
  }

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1);
  }

  return content;
};

//----------------------------------------------------------------------------------------------------------------

// Generates structured summary, decisions, and action items from a transcript using Grok/xAI.
export const generateRecordingSummary = async (transcript: string) => {
  const { apiKey, baseURL, model } = getXaiChatConfig();
  const llmConfig: Partial<ChatXAIInput> = {
    apiKey,
    model,
    temperature: 0.2,
  };

  if (baseURL) {
    llmConfig.baseURL = baseURL;
  }

  const llm = new ChatXAI(llmConfig);

  const response = await llm.invoke([
    {
      role: "system",
      content:
        "You summarize meeting transcripts. Return only valid JSON. Do not include markdown.",
    },
    {
      role: "user",
      content: `Generate structured meeting notes from this transcript.

Return this exact JSON shape:
{
  "summary": "detailed summary",
  "shortSummary": "one sentence summary",
  "keyPoints": ["point"],
  "decisions": ["decision"],
  "actionItems": [
    {
      "task": "task description",
      "owner": "person or empty string",
      "dueDate": "YYYY-MM-DD, natural language date, or empty string",
      "status": "pending"
    }
  ]
}

Transcript:
${transcript}`,
    },
  ]);

  const content = getTextContent(response.content);
  const parsedJson = JSON.parse(extractJson(content)) as unknown;

  return RecordingSummarySchema.parse(parsedJson);
};
