import {
  api,
  getConfig,
  getExtensionUrl,
  openExtensionPage,
  uploadToSignedUrl,
} from './api.js';
import { $, formatBytes, formatDuration, setText, showMessage } from './ui.js';

let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let startedAt = 0;
let durationTimer = null;
let activeObjectUrl = '';
let speechRecognition = null;
let shouldRunSpeechRecognition = false;
let finalTranscriptParts = [];
let pendingUpload = null;

const recBtn = $('#recToggle');
const preview = $('#preview');
const downloadLink = $('#downloadLink');
const recordingLink = $('#recordingLink');
const uploadBtn = $('#uploadRecording');
const message = $('#recordingMessage');

const supportedMimeType = () => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const setStatus = (value) => {
  setText('#recorderStatus', value);
};

const setUploadState = (value) => {
  setText('#uploadValue', value);
};

const setSpeechState = (value) => {
  setText('#speechValue', value);
};

const getSpeechRecognitionConstructor = () => {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
};

const getTranscriptText = () => {
  return $('#browserTranscript')?.value?.trim() || '';
};

const setTranscriptText = (value) => {
  const transcript = $('#browserTranscript');

  if (transcript) {
    transcript.value = value;
  }
};

const resetBrowserTranscript = () => {
  finalTranscriptParts = [];
  setTranscriptText('');
};

const syncBrowserTranscript = (interimTranscript = '') => {
  const transcript = [...finalTranscriptParts, interimTranscript]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  setTranscriptText(transcript);
};

const startSpeechRecognition = () => {
  const SpeechRecognition = getSpeechRecognitionConstructor();

  if (!SpeechRecognition) {
    throw new Error('Browser speech recognition is not supported in this browser.');
  }

  shouldRunSpeechRecognition = true;
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.lang = $('#speechLanguage')?.value?.trim() || 'en-US';
  speechRecognition.onstart = () => setSpeechState('Listening');
  speechRecognition.onresult = (event) => {
    let interimTranscript = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || '';

      if (result.isFinal) {
        finalTranscriptParts.push(transcript.trim());
      } else {
        interimTranscript += ` ${transcript}`;
      }
    }

    syncBrowserTranscript(interimTranscript);
  };
  speechRecognition.onerror = (event) => {
    setSpeechState(event.error || 'Error');
  };
  speechRecognition.onend = () => {
    if (!shouldRunSpeechRecognition) {
      setSpeechState('Stopped');
      return;
    }

    setSpeechState('Restarting');
    setTimeout(() => {
      if (!shouldRunSpeechRecognition || !speechRecognition) return;

      try {
        speechRecognition.start();
      } catch (_err) {
        setSpeechState('Waiting');
      }
    }, 500);
  };

  speechRecognition.start();
};

const stopSpeechRecognition = () => {
  shouldRunSpeechRecognition = false;

  if (!speechRecognition) {
    setSpeechState('Idle');
    return;
  }

  try {
    speechRecognition.stop();
  } catch (_err) {
    setSpeechState('Stopped');
  }
};

const getDurationSeconds = () => {
  if (!startedAt) return 0;

  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
};

const updateDuration = () => {
  setText('#durationValue', formatDuration(getDurationSeconds()));
};

const buildFileName = () => {
  const title = $('#recordingTitle')?.value || 'screen-recording';
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return `${slug || 'screen-recording'}-${Date.now()}.webm`;
};

const getRecordingInput = () => {
  return {
    title: $('#recordingTitle')?.value?.trim() || 'Screen Recording',
    description: $('#recordingDescription')?.value?.trim() || '',
    type: $('#recordingType')?.value || 'meeting',
  };
};

const stopStream = () => {
  if (!mediaStream) return;

  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  preview.srcObject = null;
};

const resetRecordingUi = () => {
  recBtn.disabled = false;
  recBtn.textContent = 'Start recording';
  clearInterval(durationTimer);
  durationTimer = null;
};

const prepareDownload = (blob, fileName) => {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
  }

  activeObjectUrl = URL.createObjectURL(blob);
  downloadLink.href = activeObjectUrl;
  downloadLink.download = fileName;
  downloadLink.hidden = false;
};

const uploadRecording = async (blob, durationSeconds, fileName, transcript, language) => {
  const config = await getConfig();

  if (!config.authToken) {
    throw new Error('Add a Firebase ID token in Settings before uploading.');
  }

  if (!transcript.trim()) {
    throw new Error('No browser transcript captured. Add transcript text before uploading.');
  }

  setUploadState('Creating');
  const recording = await api.createRecording(getRecordingInput());
  setText('#recordingIdValue', recording.id);

  const mimeType = blob.type || mediaRecorder?.mimeType || 'video/webm';

  setUploadState('Signing');
  const upload = await api.createUploadUrl(recording.id, {
    fileName,
    mimeType,
    fileSize: blob.size,
    durationSeconds,
  });

  setUploadState('Uploading');
  await uploadToSignedUrl(upload, blob);

  setUploadState('Completing');
  await api.completeBrowserTranscript(recording.id, {
    fileSize: blob.size,
    durationSeconds,
    transcript,
    language,
  });

  recordingLink.href = getExtensionUrl('recordings.html', { id: recording.id });
  recordingLink.hidden = false;
  uploadBtn.hidden = true;
  setUploadState('Done');
  showMessage(
    message,
    'Recording uploaded with browser transcript. AI processing will continue in the backend worker.',
    'success',
  );
};

const uploadPendingRecording = async () => {
  if (!pendingUpload) return;

  uploadBtn.disabled = true;

  try {
    setStatus('Uploading');
    await uploadRecording(
      pendingUpload.blob,
      pendingUpload.durationSeconds,
      pendingUpload.fileName,
      getTranscriptText(),
      $('#speechLanguage')?.value?.trim() || 'en-US',
    );
    setStatus('Uploaded');
  } catch (err) {
    setStatus('Upload failed');
    setUploadState('Failed');
    showMessage(message, err.message || 'Upload failed.', 'error');
  } finally {
    uploadBtn.disabled = false;
  }
};

const handleRecordingStopped = async () => {
  const durationSeconds = getDurationSeconds();
  const mimeType = mediaRecorder?.mimeType || supportedMimeType() || 'video/webm';
  const blob = new Blob(recordedChunks, { type: mimeType });
  const fileName = buildFileName();

  stopSpeechRecognition();
  stopStream();
  resetRecordingUi();
  setText('#sizeValue', formatBytes(blob.size));
  setText('#durationValue', formatDuration(durationSeconds));
  prepareDownload(blob, fileName);
  pendingUpload = {
    blob,
    durationSeconds,
    fileName,
  };
  uploadBtn.hidden = false;

  if (!getTranscriptText()) {
    setStatus('Transcript needed');
    showMessage(
      message,
      'No browser transcript was captured. Add transcript text, then upload.',
      'error',
    );
    return;
  }

  await uploadPendingRecording();
};

const startRecording = async () => {
  try {
    showMessage(message, '', 'info');
    downloadLink.hidden = true;
    recordingLink.hidden = true;
    uploadBtn.hidden = true;
    pendingUpload = null;
    resetBrowserTranscript();
    setText('#recordingIdValue', 'None');
    setText('#sizeValue', '0 B');
    setUploadState('Idle');
    setSpeechState('Idle');
    setStatus('Requesting capture');

    startSpeechRecognition();

    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    preview.srcObject = mediaStream;
    await preview.play().catch(() => undefined);

    recordedChunks = [];
    startedAt = Date.now();
    updateDuration();
    durationTimer = setInterval(updateDuration, 1000);

    const mimeType = supportedMimeType();
    mediaRecorder = new MediaRecorder(
      mediaStream,
      mimeType ? { mimeType } : undefined,
    );
    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = handleRecordingStopped;
    mediaStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (mediaRecorder?.state === 'recording') {
          mediaRecorder.stop();
        }
      });
    });

    mediaRecorder.start();
    recBtn.textContent = 'Stop recording';
    setStatus('Recording');
  } catch (err) {
    stopSpeechRecognition();
    stopStream();
    resetRecordingUi();
    setStatus('Ready');
    showMessage(message, err.message || 'Screen capture failed.', 'error');
  }
};

const stopRecording = () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  recBtn.disabled = true;
  setStatus('Stopping');
  stopSpeechRecognition();
  mediaRecorder.stop();
};

recBtn?.addEventListener('click', () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    startRecording();
  } else {
    stopRecording();
  }
});

uploadBtn?.addEventListener('click', uploadPendingRecording);
$('#openDashboard')?.addEventListener('click', () => openExtensionPage('recordings.html'));
$('#openSettings')?.addEventListener('click', () => openExtensionPage('settings.html'));
