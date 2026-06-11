# Product Overview: AI Meeting Notes App

## Vision

Build a mobile-first AI note-taking application similar to Wisp AI, Otter, and Plaud.

The app allows users to record meetings, conversations, lectures, interviews, and voice notes. After recording, it automatically transcribes the audio, generates structured summaries, extracts action items, and lets users chat with their recordings using AI.

The goal is to eliminate manual note-taking and transform conversations into searchable knowledge.

## User Flow

### 1. User Records Audio

The user opens the app and starts a recording.

Example use cases:

- Work meeting
- Client call
- College lecture
- Interview
- Brainstorming session
- Personal voice note

Recording should continue in the background if the app is minimized.

After recording ends:

```text
Audio file
  -> Upload
  -> AWS S3
```

### 2. Audio Upload

The recorded audio file is uploaded to AWS S3.

Store:

- File URL
- File size
- Duration
- Upload timestamp

Recording status becomes:

```text
uploaded
```

### 3. Transcription

After upload, the backend sends the audio to Deepgram.

Deepgram returns:

- Raw transcript
- Speaker information
- Timestamps
- Language

Example transcript:

```text
Speaker 1:
Let's launch next week.

Speaker 2:
We still need QA.
```

Store:

- Full transcript
- Transcript segments
- Speakers
- Timestamps

Recording status becomes:

```text
transcribed
```

### 4. AI Analysis

After transcription, the transcript is sent to OpenAI or Gemini.

Generate:

#### Summary

Example:

```text
The meeting discussed launch readiness.
The team agreed to target next week.
QA remains unfinished.
```

#### Key Points

Example:

- Launch planned next week
- QA still pending
- Marketing assets completed

#### Decisions

Example:

- Product launch date approved
- Beta program closed

#### Action Items

Example:

```text
Task:
Complete QA

Owner:
John

Due:
Friday
```

Store all generated content.

Recording status becomes:

```text
completed
```

## Chat With Notes

This is the primary AI feature. Users can open a recording and ask questions about it.

Example questions:

- What decisions were made?
- Who was responsible for QA?
- Summarize the discussion about pricing.
- What did Sarah say regarding launch?

### How Chat Works

#### Step 1: Chunk Transcript

The transcript is split into chunks.

Example:

```text
Chunk 1
Chunk 2
Chunk 3
...
```

#### Step 2: Generate Embeddings

Embeddings are generated for the transcript chunks and stored in a vector database.

Supported vector database options:

- Pinecone
- Qdrant

#### Step 3: User Asks a Question

Example:

```text
What were the action items?
```

#### Step 4: Retrieve Relevant Chunks

Relevant chunks are retrieved from the vector database.

Example:

```text
Chunk 5
Chunk 12
Chunk 19
```

#### Step 5: Build LLM Prompt

Retrieved chunks are sent to the LLM.

The prompt contains:

- User question
- Relevant transcript chunks
- Chat history

#### Step 6: Generate Answer

The LLM generates an answer.

Example:

```text
The team assigned QA testing to John.
The deadline is Friday.
```

## Search Feature

Users can search recordings.

Example searches:

- launch
- pricing
- customer feedback

Search should support both keyword search and semantic search.

### Keyword Search

Match against:

- Title
- Transcript

### Semantic Search

Use embeddings to find related meaning, even when the exact keyword is not present.

Example query:

```text
deadline discussion
```

Should find recordings mentioning:

- Launch schedule
- Milestones
- Delivery dates

This should work even if the exact word `deadline` never appears.

## Recording Library

Users have a personal library of recordings.

Each recording contains:

- Title
- Duration
- Date
- Status
- Summary
- Transcript

Users can:

- View recordings
- Rename recordings
- Delete recordings
- Search recordings

## Authentication

Use Firebase Authentication.

Supported login methods:

- Google Login
- Apple Login (future)
- Email Login (optional)

Each user's recordings are isolated. Users can only access their own data.

## Data Storage

### Firestore

Stores:

- Users
- Recording metadata
- Transcripts
- Summaries
- Action items
- Chats
- Usage metrics

### AWS S3

Stores:

- Audio files

### Vector Database

Stores:

- Transcript embeddings
- Chunk metadata

## Recording Processing Pipeline

```text
User records audio
  -> Upload to S3
  -> Create recording document
  -> Deepgram transcription
  -> Store transcript
  -> Generate summary
  -> Generate action items
  -> Generate embeddings
  -> Store embeddings
  -> Ready for chat
```

## Recording States

- `uploading`
- `uploaded`
- `transcribing`
- `transcribed`
- `summarizing`
- `embedding`
- `completed`
- `failed`

The frontend should display the current status.

## Usage Tracking

Track:

- Recording minutes
- Transcription minutes
- Storage usage
- AI requests

Usage tracking will support future subscription plans.
