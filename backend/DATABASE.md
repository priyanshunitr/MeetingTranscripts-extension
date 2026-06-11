# Database Schema

Firestore stores user profiles, recording metadata, transcripts, AI outputs, chat history, and usage data for the AI meeting notes app.

## Collections

- [`users/{userId}`](#users-collection)
- [`recordings/{recordingId}`](#recordings-collection)
- [`recordings/{recordingId}/segments/{segmentId}`](#transcript-segments)
- [`recordings/{recordingId}/chunks/{chunkId}`](#transcript-chunks)
- [`recordings/{recordingId}/chats/{chatId}`](#chat-sessions)
- [`recordings/{recordingId}/chats/{chatId}/messages/{messageId}`](#chat-messages)

## Users Collection

Path:

```text
users/{userId}
```

Example document:

```ts
{
  uid: "firebase_user_id",
  name: "Priyanshu Sahu",
  email: "user@email.com",

  createdAt: Timestamp,
  updatedAt: Timestamp,

  settings: {
    language: "en",
    autoSummary: true,
    autoActionItems: true,
    defaultRecordingTitle: "Untitled Recording"
  },

  usage: {
    plan: "free",
    recordingMinutes: 120,
    transcriptionMinutes: 120,
    storageBytes: 2450000,
    aiRequestCount: 12,
    updatedAt: Timestamp
  }
}
```

## Recordings Collection

Path:

```text
recordings/{recordingId}
```

Example document:

```ts
{
  userId: "firebase_user_id",

  title: "Client Meeting",
  description: "",
  type: "meeting", // meeting, lecture, interview, voice_note, call

  status: "completed",
  /*
    uploading
    uploaded
    transcribing
    transcribed
    summarizing
    embedding
    completed
    failed
  */

  audio: {
    s3Key: "users/userId/recordings/recordingId/audio.m4a",
    fileUrl: "https://s3...",
    fileName: "audio.m4a",
    mimeType: "audio/m4a",
    fileSize: 2450000,
    durationSeconds: 1840,
    uploadedAt: Timestamp
  },

  transcript: {
    fullText: "Speaker 1: Let's launch next week...",
    language: "en",
    wordCount: 5200,
    provider: "deepgram",
    deepgramRequestId: "dg_xxx",
    transcribedAt: Timestamp
  },

  ai: {
    summary: "The meeting discussed launch readiness...",
    shortSummary: "Launch planned next week, QA pending.",
    keyPoints: [
      "Launch planned next week",
      "QA still pending",
      "Marketing assets completed"
    ],
    decisions: [
      "Product launch date approved",
      "Beta program closed"
    ],
    actionItems: [
      {
        task: "Complete QA",
        owner: "John",
        dueDate: "2026-06-12",
        status: "pending"
      }
    ],
    generatedAt: Timestamp,
    model: process.env.XAI_CHAT_MODEL
  },

  search: {
    keywords: [
      "launch",
      "qa",
      "marketing",
      "pricing"
    ],
    embeddingStatus: "completed",
    vectorNamespace: "userId",
    vectorCollection: "recording_chunks"
  },

  stats: {
    chatCount: 4,
    aiRequestCount: 6,
    viewCount: 10
  },

  error: {
    message: "",
    stage: "",
    code: ""
  },

  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: null
}
```

## Transcript Segments

Use transcript segments for speaker-based transcript display.

Path:

```text
recordings/{recordingId}/segments/{segmentId}
```

Example document:

```ts
{
  userId: "firebase_user_id",
  recordingId: "recording_id",

  speaker: "Speaker 1",
  speakerLabel: "John",
  text: "Let's launch next week.",

  startTime: 12.4,
  endTime: 18.9,

  confidence: 0.94,

  words: [
    {
      word: "Let's",
      startTime: 12.4,
      endTime: 12.8,
      confidence: 0.97
    }
  ],

  createdAt: Timestamp
}
```

## Transcript Chunks

Use transcript chunks for chat retrieval and semantic search.

Path:

```text
recordings/{recordingId}/chunks/{chunkId}
```

Example document:

```ts
{
  userId: "firebase_user_id",
  recordingId: "recording_id",

  chunkIndex: 0,
  text: "Speaker 1: Let's launch next week. Speaker 2: We still need QA.",

  startTime: 12.4,
  endTime: 55.8,

  speakerNames: ["Speaker 1", "Speaker 2"],

  tokenCount: 420,

  embedding: {
    provider: "openai",
    model: process.env.OPENAI_EMBEDDING_MODEL,
    vectorId: "recordingId_chunk_0",
    storedInVectorDb: true
  },

  createdAt: Timestamp
}
```

## Chat Sessions

Path:

```text
recordings/{recordingId}/chats/{chatId}
```

Example document:

```ts
{
  userId: "firebase_user_id",
  recordingId: "recording_id",

  title: "Questions about launch",

  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## Chat Messages

Path:

```text
recordings/{recordingId}/chats/{chatId}/messages/{messageId}
```

Example document:

```ts
{
  userId: "firebase_user_id",
  recordingId: "recording_id",
  chatId: "chat_id",

  role: "user", // user, assistant
  content: "Who was responsible for QA?",

  sources: [
    {
      chunkId: "chunk_5",
      startTime: 320.5,
      endTime: 355.2,
      textPreview: "John will complete QA by Friday..."
    }
  ],

  model: process.env.XAI_CHAT_MODEL,
  tokenUsage: {
    inputTokens: 1200,
    outputTokens: 180,
    totalTokens: 1380
  },

  createdAt: Timestamp
}
```
