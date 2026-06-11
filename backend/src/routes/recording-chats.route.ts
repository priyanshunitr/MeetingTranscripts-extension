import express from "express";
import type { Request, Response } from "express";
import {
  CreateChatMessageSchema,
  CreateChatSessionSchema,
} from "../schema/chat.schema";
import {
  createChatMessage,
  createChatSession,
  deleteChatSession,
  findChatSessionWithMessages,
  listChatSessions,
} from "../services/chat.services";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router({ mergeParams: true });

const parseRequest = <T>(
  result: { success: true; data: T } | { success: false; error: { issues: any[] } },
  message: string,
) => {
  if (!result.success) {
    throw new ApiError(400, message, result.error.issues);
  }

  return result.data;
};

//----------------------------------------------------------------------------------------------------------------

const getRecordingId = (req: Request) => {
  const { recordingId } = req.params;

  if (!recordingId || Array.isArray(recordingId)) {
    throw new ApiError(400, "recordingId is required");
  }

  return recordingId;
};

//----------------------------------------------------------------------------------------------------------------

const getChatId = (req: Request) => {
  const { chatId } = req.params;

  if (!chatId || Array.isArray(chatId)) {
    throw new ApiError(400, "chatId is required");
  }

  return chatId;
};

//----------------------------------------------------------------------------------------------------------------

const getAuthenticatedUserId = (req: Request) => {
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  return String(userId);
};

//----------------------------------------------------------------------------------------------------------------

// POST /recordings/:recordingId/chats
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      CreateChatSessionSchema.safeParse(req.body),
      "Invalid chat session create request",
    );

    const chat = await createChatSession(getRecordingId(req), {
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    if (!chat) {
      throw new ApiError(404, "Recording not found");
    }

    res
      .status(201)
      .json(new ApiResponse(201, chat, "Chat session created successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /recordings/:recordingId/chats
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const chats = await listChatSessions(
      getRecordingId(req),
      getAuthenticatedUserId(req),
    );

    if (!chats) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(new ApiResponse(200, chats, "Chat sessions fetched successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// POST /recordings/:recordingId/chats/:chatId/messages
router.post(
  "/:chatId/messages",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      CreateChatMessageSchema.safeParse(req.body),
      "Invalid chat message request",
    );

    const messages = await createChatMessage(
      getRecordingId(req),
      getChatId(req),
      {
        ...input,
        userId: getAuthenticatedUserId(req),
      },
    );

    if (!messages) {
      throw new ApiError(404, "Chat session not found");
    }

    res
      .status(201)
      .json(new ApiResponse(201, messages, "Chat message created successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /recordings/:recordingId/chats/:chatId
router.get(
  "/:chatId",
  asyncHandler(async (req: Request, res: Response) => {
    const chat = await findChatSessionWithMessages(
      getRecordingId(req),
      getChatId(req),
      getAuthenticatedUserId(req),
    );

    if (!chat) {
      throw new ApiError(404, "Chat session not found");
    }

    res.json(new ApiResponse(200, chat, "Chat session fetched successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// DELETE /recordings/:recordingId/chats/:chatId
router.delete(
  "/:chatId",
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await deleteChatSession(
      getRecordingId(req),
      getChatId(req),
      getAuthenticatedUserId(req),
    );

    if (!deleted) {
      throw new ApiError(404, "Chat session not found");
    }

    res.json(new ApiResponse(200, deleted, "Chat session deleted successfully"));
  }),
);

export default router;
