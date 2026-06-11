import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth.middleware";
import {
  generateEmbeddings,
  splitTranscriptIntoChunks,
} from "../services/embedding.services";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();
router.use(verifyJWT);

const GenerateEmbeddingsSchema = z.object({
  transcript: z.string().min(1),
});

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

// POST /embedding/generate
router.post(
  "/generate",
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseRequest(
      GenerateEmbeddingsSchema.safeParse(req.body),
      "Invalid embeddings request",
    );

    const chunks = splitTranscriptIntoChunks(input.transcript);
    const embeddings = await generateEmbeddings(chunks);

    res.json(
      new ApiResponse(
        200,
        {
          chunks,
          embeddings,
        },
        "Embeddings generated successfully",
      ),
    );
  }),
);

export default router;
