# Backend Agent Notes

This backend is an Express + TypeScript API for the meeting notes app.

## Current Stack

- Runtime: Node.js with ESM (`"type": "module"`)
- Server: Express
- Database: Firebase Admin SDK + Firestore
- Auth: Firebase Authentication ID tokens verified by Firebase Admin
- Validation: Zod
- Jobs: BullMQ + Redis
- Transcription: Deepgram
- Summary/chat generation: Grok/xAI through LangChain
- Embeddings: OpenAI embeddings stored/searched in Qdrant
- Audio storage: S3 signed upload URLs, with signed read URLs for worker transcription

## Firestore Setup

Firebase/Firestore initialization lives in:

- `src/lib/firestore.ts`

That file should stay focused on:

- loading `.env`
- reading `FIREBASE_SERVICE_ACCOUNT`
- initializing Firebase Admin
- exporting `admin`
- exporting `firestore`

Keep collection-specific database logic out of `src/lib/firestore.ts`.

## User Services

User persistence logic lives in:

- `src/services/user.services.ts`

Current exported user helpers:

- `findUserById`
- `syncFirebaseUser`
- `AppUser`

Use this service file when routes or middleware need user data. Do not call `firestore.collection("users")` directly from routes unless there is a clear reason to add a new service boundary later.

## Auth

Auth HTTP routes live in:

- `src/routes/auth.route.ts`

Current endpoints:

- `POST /auth/sync`
- `GET /auth/me`

Protected routes should use:

- `verifyJWT` from `src/middleware/auth.middleware.ts`

The frontend authenticates with Firebase, then sends:

```text
Authorization: Bearer <firebase_id_token>
```

Backend routes should use `(req as any).user.id` after `verifyJWT`; do not accept client-controlled `userId` in request bodies or query strings.

## Route Style

Route handlers should use:

- `asyncHandler` from `src/utils/asyncHandler.ts`
- `ApiError` from `src/utils/ApiError.ts`
- `ApiResponse` from `src/utils/ApiResponse.ts`

Avoid raw response shapes like:

```ts
res.status(400).json({ error: "..." })
```

Prefer:

```ts
throw new ApiError(400, "message")
res.status(200).json(new ApiResponse(200, data, "message"))
```

## Error Handling

The centralized Express error formatter is registered in:

- `src/app.ts`

Thrown `ApiError` instances should flow through `asyncHandler` into this error middleware.

## Firebase Credentials

The backend expects `FIREBASE_SERVICE_ACCOUNT` in `.env`.

It may be either:

- a full Firebase service account JSON string
- a path to a Firebase service account JSON file

Service account JSON files contain secrets and must stay untracked. `.gitignore` ignores common service account filenames.

## Development Commands

From `backend/`:

```sh
npm run dev
npm run worker
npm exec tsc -- --noEmit
npm test
```

Use `npm run dev` for the API server. Use `npm run worker` for a worker-only process in production-style deployments. `npm test` runs the Vitest backend tests.

## File Boundaries

- `src/app.ts`: Express app setup, middleware registration, route mounting, final error handler
- `src/index.ts`: API server bootstrap and optional worker startup
- `src/worker.ts`: worker-only bootstrap
- `src/lib/firestore.ts`: Firebase Admin and Firestore initialization only
- `src/jobs/*`: BullMQ queues, workers, and recording processing handlers
- `src/services/*.services.ts`: data access and persistence logic
- `src/routes/*.route.ts`: HTTP request/response flow
- `src/middleware/*.middleware.ts`: reusable Express middleware
- `src/schema/*.schema.ts`: Zod schemas and shared request/user types
- `src/utils/*`: shared response/error/async utilities

When adding new backend behavior, keep the route thin and put reusable data logic in `src/services`.

## Formatting Style

When writing multiple functions one after another, or multiple routes one after another, separate them with this exact divider:

```ts
//----------------------------------------------------------------------------------------------------------------
```

Leave one blank line above and below the divider.
