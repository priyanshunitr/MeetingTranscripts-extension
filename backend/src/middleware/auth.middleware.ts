import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { admin } from "../lib/firestore";
import { syncFirebaseUser } from "../services/user.services";
import type { RequestHandler } from "express";

export const verifyJWT = asyncHandler(async (req, _res, next) => {
    const token = (req.cookies as any)?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized request");
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
        decoded = await admin.auth().verifyIdToken(token);
    } catch (err: any) {
        throw new ApiError(401, err?.message || "Invalid Firebase ID token");
    }

    if (!decoded.uid) {
        throw new ApiError(401, "Invalid Firebase ID token");
    }

    const provider = decoded.firebase?.sign_in_provider ?? "firebase";
    const firebaseUser = {
        uid: decoded.uid,
        authProvider: provider,
    } as {
        uid: string;
        email?: string;
        name?: string;
        authProvider: string;
    };

    if (decoded.email) {
        firebaseUser.email = decoded.email;
    }

    if (typeof decoded.name === "string") {
        firebaseUser.name = decoded.name;
    }

    const user = await syncFirebaseUser(firebaseUser);

    if (!user) {
        throw new ApiError(401, "Unable to sync Firebase user");
    }

    // attach a safe user object to the request
    ;(req as any).user = {
        id: user.id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
    };

    next();
}) as RequestHandler;
