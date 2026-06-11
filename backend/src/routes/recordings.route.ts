import express from "express";
import type { Request, Response } from "express";
import {
  CompleteRecordingUploadSchema,
  CreateRecordingSchema,
  CreateRecordingUploadUrlSchema,
  RecordingSearchQuerySchema,
  UpdateRecordingSchema,
} from "../schema/recording.schema";
import { ImportGoogleMeetSchema } from "../schema/google-meet.schema";
import {
  completeRecordingUpload,
  createRecording,
  createRecordingUploadUrl,
  deleteRecording,
  findRecordingById,
  listRecordings,
  updateRecording,
} from "../services/recording.services";
import { importGoogleMeetRecording } from "../services/google-meet.services";
import { searchRecordings } from "../services/search.services";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyJWT } from "../middleware/auth.middleware";
import recordingChatsRouter from "./recording-chats.route";

const router = express.Router();
router.use(verifyJWT);

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

const getAuthenticatedUserId = (req: Request) => {
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  return String(userId);
};

//----------------------------------------------------------------------------------------------------------------

router.use("/:recordingId/chats", recordingChatsRouter);

//----------------------------------------------------------------------------------------------------------------

// POST /recordings
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      CreateRecordingSchema.safeParse(req.body),
      "Invalid recording create request",
    );

    const recording = await createRecording({
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    res
      .status(201)
      .json(new ApiResponse(201, recording, "Recording created successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// POST /recordings/:recordingId/upload-url
router.post(
  "/:recordingId/upload-url",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      CreateRecordingUploadUrlSchema.safeParse(req.body),
      "Invalid upload URL request",
    );

    const upload = await createRecordingUploadUrl(getRecordingId(req), {
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    if (!upload) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(new ApiResponse(200, upload, "Upload URL created successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// POST /recordings/:recordingId/upload-complete
router.post(
  "/:recordingId/upload-complete",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      CompleteRecordingUploadSchema.safeParse(req.body),
      "Invalid upload complete request",
    );

    const recording = await completeRecordingUpload(getRecordingId(req), {
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    if (!recording) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(
      new ApiResponse(
        200,
        recording,
        "Recording upload completed successfully",
      ),
    );
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /recordings
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const recordings = await listRecordings(getAuthenticatedUserId(req));

    res.json(
      new ApiResponse(200, recordings, "Recordings fetched successfully"),
    );
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /recordings/search
router.get(
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = parseRequest(
      RecordingSearchQuerySchema.safeParse(req.query),
      "Invalid recording search query",
    );

    const results = await searchRecordings({
      ...query,
      userId: getAuthenticatedUserId(req),
    });

    res.json(new ApiResponse(200, results, "Recordings searched successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// POST /recordings/import/google-meet
router.post(
  "/import/google-meet",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      ImportGoogleMeetSchema.safeParse(req.body),
      "Invalid Google Meet import request",
    );

    const recording = await importGoogleMeetRecording({
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    if (!recording) {
      throw new ApiError(500, "Google Meet import did not create a recording");
    }

    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          recording,
          "Google Meet transcript imported successfully",
        ),
      );
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /recordings/:recordingId
router.get(
  "/:recordingId",
  asyncHandler(async (req: Request, res: Response) => {
    const recording = await findRecordingById(
      getRecordingId(req),
      getAuthenticatedUserId(req),
    );

    if (!recording) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(new ApiResponse(200, recording, "Recording fetched successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// PATCH /recordings/:recordingId
router.patch(
  "/:recordingId",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      UpdateRecordingSchema.safeParse(req.body),
      "Invalid recording update request",
    );

    const recording = await updateRecording(getRecordingId(req), {
      ...input,
      userId: getAuthenticatedUserId(req),
    });

    if (!recording) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(new ApiResponse(200, recording, "Recording updated successfully"));
  }),
);

//----------------------------------------------------------------------------------------------------------------

// DELETE /recordings/:recordingId
router.delete(
  "/:recordingId",
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await deleteRecording(
      getRecordingId(req),
      getAuthenticatedUserId(req),
    );

    if (!deleted) {
      throw new ApiError(404, "Recording not found");
    }

    res.json(new ApiResponse(200, deleted, "Recording deleted successfully"));
  }),
);

export default router;
