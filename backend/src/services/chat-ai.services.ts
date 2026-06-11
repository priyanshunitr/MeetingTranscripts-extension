import { ChatXAI, type ChatXAIInput } from "@langchain/xai";
import type { AppChatMessage } from "./chat.services";
import type { RetrievedRecordingChunk } from "./qdrant.services";
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

const formatSources = (chunks: RetrievedRecordingChunk[]) => {
  return chunks
    .map((chunk, index) => {
      return `[${index + 1}] ${chunk.text}`;
    })
    .join("\n\n");
};

//----------------------------------------------------------------------------------------------------------------

const formatHistory = (messages: AppChatMessage[]) => {
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
};

//----------------------------------------------------------------------------------------------------------------

// Generates an answer for a recording chat using retrieved transcript chunks and chat history.
export const generateChatAnswer = async (input: {
  question: string;
  chunks: RetrievedRecordingChunk[];
  history: AppChatMessage[];
}) => {
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
        "You answer questions using only the provided transcript chunks. If the answer is not in the chunks, say that the transcript does not include enough information.",
    },
    {
      role: "user",
      content: `Chat history:
${formatHistory(input.history)}

Relevant transcript chunks:
${formatSources(input.chunks)}

Question:
${input.question}`,
    },
  ]);

  return {
    content: getTextContent(response.content),
    model,
  };
};
