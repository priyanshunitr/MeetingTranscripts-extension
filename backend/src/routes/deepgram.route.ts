import express from "express";
import type { Request, Response } from "express";
import { verifyJWT } from "../middleware/auth.middleware";
import { DeepgramTranscribeUrlSchema } from "../schema/deepgram.schema";
import { transcribeAudioUrl } from "../services/deepgram.services";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();
router.use(verifyJWT);

// GET /deepgram/health
router.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(
      new ApiResponse(
        200,
        {
          configured: Boolean(process.env.DEEPGRAM_API_KEY),
        },
        "Deepgram setup status",
      ),
    );
  }),
);

//----------------------------------------------------------------------------------------------------------------

// POST /deepgram/transcribe-url
router.post(
  "/transcribe-url",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = DeepgramTranscribeUrlSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new ApiError(
        400,
        "Invalid Deepgram transcription request",
        parsed.error.issues,
      );
    }

    const transcription = await transcribeAudioUrl(parsed.data);

    res.json(
      new ApiResponse(
        200,
        transcription,
        "Audio transcribed successfully",
      ),
    );
  }),
);

export default router;
