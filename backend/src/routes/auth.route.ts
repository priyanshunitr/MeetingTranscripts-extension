import express from "express";
import type { Request, Response } from "express";
import { verifyJWT } from "../middleware/auth.middleware";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// POST /auth/sync
router.post(
  "/sync",
  verifyJWT,
  asyncHandler(async (req: Request, res: Response) => {
    res.json(
      new ApiResponse(
        200,
        (req as any).user,
        "Firebase user synced successfully",
      ),
    );
  }),
);

//----------------------------------------------------------------------------------------------------------------

// GET /auth/me
router.get(
  "/me",
  verifyJWT,
  asyncHandler(async (req: Request, res: Response) => {
    res.json(new ApiResponse(200, (req as any).user, "User fetched successfully"));
  }),
);

export default router;
