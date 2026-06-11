# Frontend to Backend Integration TODO

## Step 1: Map backend contracts
- [x] Confirm backend server entry point and default base URL.
- [x] Confirm protected route requirements.
- [x] Confirm recording upload flow.
- [x] Confirm chat and search route contracts.

## Step 2: Add extension configuration
- [x] Update Manifest V3 permissions and host permissions.
- [x] Add shared frontend API/config utilities.
- [x] Add a settings page for backend URL and bearer token.

## Step 3: Replace starter popup
- [x] Replace the placeholder popup UI.
- [x] Add backend connection status.
- [x] Add navigation to recorder, recordings, and settings.
- [x] Show recent recordings from the backend.

## Step 4: Connect recorder upload flow
- [x] Capture screen/audio as before.
- [x] Create a recording in the backend.
- [x] Request an S3 upload URL from the backend.
- [x] Upload the recorded WebM blob to the signed URL.
- [x] Mark upload complete and link to the recording detail view.

## Step 5: Add recordings dashboard
- [x] List backend recordings.
- [x] Show recording detail, transcript, summary, key points, decisions, and action items.
- [x] Support search.
- [x] Support metadata updates and deletion.
- [x] Support chat sessions and messages for a recording.
- [x] Expose Google Meet import as an advanced backend action.

## Step 6: Verify build
- [x] Run extension build.
- [x] Fix build errors.
- [x] Summarize usage and remaining runtime assumptions.

## Step 7: Replace Deepgram upload processing with browser speech transcript
- [x] Add backend schema for browser transcript completion.
- [x] Add backend service path that saves browser transcript and queues summary/embedding without Deepgram.
- [x] Add route for browser transcript completion.
- [x] Add frontend API method for browser transcript completion.
- [x] Add browser speech recognition to recorder.
- [x] Update recorder upload flow to avoid Deepgram transcription queue.
- [x] Run extension build and backend tests/typecheck.

## Step 8: Convert extension frontend to React
- [ ] Add React dependencies and JSX build config.
- [ ] Create React app bootstrap and shared components/hooks.
- [ ] Convert popup to React.
- [ ] Convert settings page to React.
- [ ] Convert recorder page to React.
- [ ] Convert recordings dashboard to React.
- [ ] Replace static page markup with React mount roots.
- [ ] Build extension bundles.
- [ ] Run backend tests/typecheck.
