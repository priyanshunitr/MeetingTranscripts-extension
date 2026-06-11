# TODO: Backend Roadmap

This file tracks the backend flow and the remaining work for the AI meeting notes app.

`DATABASE.md` is the canonical database schema document. The old `db.md` file is no longer used.

## Recording Processing Flow

- [x] Create recording document.
  - Route: `POST /recordings`
  - Stores initial recording metadata.

- [x] Generate signed S3 upload URL.
  - Route: `POST /recordings/:recordingId/upload-url`
  - Stores `s3Key`, `fileUrl`, `fileName`, and `mimeType`.
  - Returns direct upload URL to the frontend.

- [x] Upload audio directly to S3.
  - Frontend uses the signed `PUT` URL.
  - Backend does not proxy audio bytes.

- [x] Complete upload.
  - Route: `POST /recordings/:recordingId/upload-complete`
  - Marks recording status as `uploaded`.
  - Stores file size, duration, and `uploadedAt`.
  - Adds `transcribeRecording` job to BullMQ.

- [x] Transcribe recording.
  - Job: `transcribeRecording`
  - Marks status as `transcribing`.
  - Sends audio URL to Deepgram.
  - Saves transcript text and metadata.
  - Marks status as `transcribed`.
  - Adds `summarizeRecording` job to BullMQ.

- [x] Summarize recording.
  - Job: `summarizeRecording`
  - Sends transcript to Grok/xAI through LangChain.
  - Generates summary, short summary, key points, decisions, and action items.
  - Saves generated AI content.
  - Adds `embedRecording` job to BullMQ.

- [x] Generate and store embeddings.
  - Job: `embedRecording`
  - Splits transcript into chunks.
  - Generates embeddings with OpenAI.
  - Stores embeddings in Qdrant.
  - Marks `search.embeddingStatus` as `completed`.
  - Marks recording status as `completed`.

## Database Work Left

- [x] Save Deepgram transcript segments.
  - Collection: `recordings/{recordingId}/segments/{segmentId}`
  - Store speaker, speaker label, text, start/end times, confidence, and words.

- [x] Save Firestore chunk documents.
  - Collection: `recordings/{recordingId}/chunks/{chunkId}`
  - Store chunk text, token count, speaker names when available, vector ID, provider, model, and `storedInVectorDb`.

- [x] Align `DATABASE.md` examples with configured model names.
  - Summary/chat examples reference `XAI_CHAT_MODEL`.
  - Embedding examples reference `OPENAI_EMBEDDING_MODEL`.

## Chat With Notes Left

- [x] Create chat session routes.
  - `POST /recordings/:recordingId/chats`
  - `GET /recordings/:recordingId/chats`
  - `GET /recordings/:recordingId/chats/:chatId`
  - `DELETE /recordings/:recordingId/chats/:chatId`

- [x] Create chat message route.
  - `POST /recordings/:recordingId/chats/:chatId/messages`
  - Save user message.
  - Retrieve relevant chunks from Qdrant.
  - Send question, chat history, and retrieved chunks to Grok/xAI.
  - Save assistant response with sources.

- [x] Store chat sources.
  - Save `chunkId`, `startTime`, `endTime`, and `textPreview`.

- [x] Increment chat stats.
  - Increment `stats.chatCount`.
  - Increment `stats.aiRequestCount`.

## Search Left

- [x] Add keyword search.
  - Search recording title.
  - Search transcript text.

- [x] Add semantic search.
  - Generate query embedding.
  - Search Qdrant.
  - Return matching recordings/chunks.

- [x] Add search routes.
  - Route: `GET /recordings/search?q=...&mode=hybrid`
  - Uses one route with `keyword`, `semantic`, and `hybrid` modes.

## Auth And Security Left

- [x] Use authenticated user context in recording routes.
  - Recording routes now use `req.user.id` from JWT middleware.
  - Nested chat routes also use authenticated user context.

- [x] Protect recording routes.
  - Applied `verifyJWT`.
  - Removed client-controlled `userId` from recording/chat request schemas.

- [x] Confirm Firebase Auth strategy.
  - Product doc says Firebase Authentication.
  - Backend now verifies Firebase ID tokens with Firebase Admin.
  - Google OAuth is handled by Firebase on the frontend.
  - Backend syncs Firebase users through `POST /auth/sync`.

## Usage Tracking Left

- [x] Track recording minutes.
- [x] Track transcription minutes.
- [x] Track storage usage.
- [x] Track AI requests.
- [x] Prepare usage metrics for future subscription plans.

## Cleanup Left

- [x] Renamed embedding route file to `embedding.route.ts`.
- [x] Renamed mounted path to `/embedding`.
- [x] Update imports after the rename.
- [x] Add tests for recording routes and job handlers.
- [x] Add a worker-only start command for production deployments.

## Current Notes

- BullMQ + Redis is installed and wired.
- Deepgram transcription runs in a background job.
- Grok/xAI summary generation runs through LangChain.
- OpenAI embeddings are stored in Qdrant.
- Redis must be running for queued jobs to process.
- Qdrant must be running for embedding storage.
