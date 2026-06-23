import { $, formatBytes, formatDuration, setText, showMessage } from './ui.js';
import {
  mountLiveSpeechRecognition,
  resetLiveTranscript,
  startLiveSpeechRecognition,
  stopLiveSpeechRecognition,
} from './liveSpeechRecognition.jsx';

let mediaRecorder = null;
let mediaStream = null;
let tabStream = null;
let microphoneStream = null;
let audioContext = null;
let recordedChunks = [];
let startedAt = 0;
let durationTimer = null;
let activeObjectUrl = '';

const recBtn = $('#recToggle');
const preview = $('#preview');
const downloadLink = $('#downloadLink');
const message = $('#recordingMessage');
const liveSpeechRoot = $('#liveSpeechRecognition');

mountLiveSpeechRecognition(liveSpeechRoot);

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

const getDurationSeconds = () => {
  if (!startedAt) return 0;

  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
};

const updateDuration = () => {
  setText('#durationValue', formatDuration(getDurationSeconds()));
};

const hasAudioTracks = (stream) => {
  return !!stream?.getAudioTracks().length;
};

const chooseDesktopMedia = () => {
  return new Promise((resolve, reject) => {
    const desktopCapture = globalThis.chrome?.desktopCapture;

    if (!desktopCapture?.chooseDesktopMedia) {
      reject(new Error('Chrome tab capture is not available.'));
      return;
    }

    desktopCapture.chooseDesktopMedia(
      ['tab', 'audio'],
      (streamId, options) => {
        if (!streamId) {
          reject(new Error('Tab capture was cancelled.'));
          return;
        }

        resolve({
          streamId,
          canRequestAudioTrack: options?.canRequestAudioTrack !== false,
        });
      },
    );
  });
};

const captureTabStream = async () => {
  const { streamId, canRequestAudioTrack } = await chooseDesktopMedia();
  const tabVideo = {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: streamId,
      maxFrameRate: 30,
    },
  };
  const tabAudio = {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: streamId,
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: tabVideo,
      audio: canRequestAudioTrack ? tabAudio : false,
    });
  } catch (err) {
    if (!canRequestAudioTrack) throw err;

    showMessage(
      message,
      'Computer audio was not available for that source. Recording video and microphone audio only.',
      'info',
    );

    return navigator.mediaDevices.getUserMedia({
      video: tabVideo,
      audio: false,
    });
  }
};

const connectAudioSource = (destination, stream) => {
  if (!hasAudioTracks(stream)) return;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(destination);
};

const buildRecorderStream = async (tabCaptureStream) => {
  tabStream = tabCaptureStream;

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (_err) {
    microphoneStream = null;
  }

  const videoTracks = tabCaptureStream.getVideoTracks();
  const audioStreams = [tabCaptureStream, microphoneStream].filter(
    (stream) => hasAudioTracks(stream),
  );

  if (!audioStreams.length) {
    return new MediaStream(videoTracks);
  }

  audioContext = new AudioContext();
  await audioContext.resume().catch(() => undefined);

  const destination = audioContext.createMediaStreamDestination();
  audioStreams.forEach((stream) => connectAudioSource(destination, stream));

  return new MediaStream([
    ...videoTracks,
    ...destination.stream.getAudioTracks(),
  ]);
};

const stopStream = () => {
  [mediaStream, tabStream, microphoneStream].forEach((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  });

  mediaStream = null;
  tabStream = null;
  microphoneStream = null;

  if (audioContext) {
    audioContext.close().catch(() => undefined);
    audioContext = null;
  }

  preview.srcObject = null;
};

const resetRecordingUi = () => {
  recBtn.disabled = false;
  recBtn.textContent = 'Start recording';
  clearInterval(durationTimer);
  durationTimer = null;
};

const buildFileName = () => {
  return `tab-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
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

const handleRecordingStopped = () => {
  const durationSeconds = getDurationSeconds();
  const mimeType = mediaRecorder?.mimeType || supportedMimeType() || 'video/webm';
  const blob = new Blob(recordedChunks, { type: mimeType });

  stopLiveSpeechRecognition().catch(() => undefined);
  stopStream();
  resetRecordingUi();
  setText('#sizeValue', formatBytes(blob.size));
  setText('#durationValue', formatDuration(durationSeconds));
  prepareDownload(blob, buildFileName());
  setStatus('Ready to download');
  showMessage(message, 'Recording finished. Download your local copy.', 'success');
};

const startRecording = async () => {
  try {
    showMessage(message, '', 'info');
    downloadLink.hidden = true;
    setText('#sizeValue', '0 B');
    setText('#durationValue', '0:00');
    setStatus('Requesting capture');

    const captureStream = await captureTabStream();
    mediaStream = await buildRecorderStream(captureStream);
    preview.srcObject = captureStream;
    await preview.play().catch(() => undefined);

    if (!hasAudioTracks(captureStream)) {
      showMessage(
        message,
        'Tab audio was not shared. Select a Chrome tab that is playing audio and enable Share tab audio in the picker.',
        'info',
      );
    }

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
    tabStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (mediaRecorder?.state === 'recording') {
          mediaRecorder.stop();
        }
      });
    });

    mediaRecorder.start();
    resetLiveTranscript();
    startLiveSpeechRecognition().catch(() => undefined);
    recBtn.textContent = 'Stop recording';
    setStatus('Recording');
  } catch (err) {
    stopLiveSpeechRecognition().catch(() => undefined);
    stopStream();
    resetRecordingUi();
    setStatus('Ready');
    showMessage(message, err.message || 'Tab capture failed.', 'error');
  }
};

const stopRecording = () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  recBtn.disabled = true;
  setStatus('Stopping');
  mediaRecorder.stop();
};

recBtn?.addEventListener('click', () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    startRecording();
  } else {
    stopRecording();
  }
});
