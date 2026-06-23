import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition';

const DEFAULT_LANGUAGE = 'en-US';
const MESSAGE_EVENT = 'live-speech-recognition-message';
const RESET_EVENT = 'live-speech-recognition-reset';

const emitRecognitionMessage = (message, tone = 'info') => {
  window.dispatchEvent(
    new CustomEvent(MESSAGE_EVENT, {
      detail: { message, tone },
    }),
  );
};

export const resetLiveTranscript = () => {
  window.dispatchEvent(new Event(RESET_EVENT));
};

export const startLiveSpeechRecognition = async (
  { language = DEFAULT_LANGUAGE } = {},
) => {
  if (!SpeechRecognition.browserSupportsSpeechRecognition()) {
    const error = new Error(
      'Live speech recognition is not supported in this browser.',
    );

    emitRecognitionMessage(error.message, 'error');
    throw error;
  }

  const continuous = SpeechRecognition.browserSupportsContinuousListening();

  try {
    await SpeechRecognition.startListening({
      continuous,
      language,
    });

    emitRecognitionMessage(
      continuous
        ? ''
        : 'Continuous speech recognition is not fully supported here. Listening may stop after pauses.',
      'info',
    );
  } catch (err) {
    emitRecognitionMessage(
      err?.message || 'Live speech recognition could not start.',
      'error',
    );
    throw err;
  }
};

export const stopLiveSpeechRecognition = async () => {
  if (!SpeechRecognition.browserSupportsSpeechRecognition()) return;

  const recognitionManager = SpeechRecognition.getRecognitionManager?.();
  if (!recognitionManager?.listening) return;

  await SpeechRecognition.stopListening().catch(() => undefined);
};

const LiveSpeechRecognitionPanel = () => {
  const [notice, setNotice] = useState({ message: '', tone: 'info' });
  const {
    transcript,
    interimTranscript,
    finalTranscript,
    resetTranscript,
    listening,
    browserSupportsSpeechRecognition,
    browserSupportsContinuousListening,
    isMicrophoneAvailable,
  } = useSpeechRecognition({ clearTranscriptOnListen: false });

  useEffect(() => {
    const handleMessage = (event) => {
      setNotice(event.detail || { message: '', tone: 'info' });
    };

    window.addEventListener(MESSAGE_EVENT, handleMessage);
    return () => window.removeEventListener(MESSAGE_EVENT, handleMessage);
  }, []);

  useEffect(() => {
    const handleReset = () => {
      resetTranscript();
      setNotice({ message: '', tone: 'info' });
    };

    window.addEventListener(RESET_EVENT, handleReset);
    return () => window.removeEventListener(RESET_EVENT, handleReset);
  }, [resetTranscript]);

  const status = useMemo(() => {
    if (!browserSupportsSpeechRecognition) return 'Unsupported';
    if (!isMicrophoneAvailable) return 'Mic blocked';
    return listening ? 'Listening' : 'Ready';
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, listening]);

  const statusClass = useMemo(() => {
    if (!browserSupportsSpeechRecognition || !isMicrophoneAvailable) {
      return 'status-failed';
    }

    return listening ? 'status-processing' : 'status-completed';
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, listening]);

  const startListening = useCallback(async () => {
    await startLiveSpeechRecognition();
  }, []);

  const stopListening = useCallback(async () => {
    await stopLiveSpeechRecognition();
  }, []);

  const hasTranscript = !!transcript.trim();
  const canStart = browserSupportsSpeechRecognition && isMicrophoneAvailable;

  return (
    <section className="panel stack speech-panel">
      <div className="section-title">
        <div>
          <h2>Live transcript</h2>
          <p className="muted small">Microphone speech recognition</p>
        </div>
        <span className={`status-pill ${statusClass}`}>{status}</span>
      </div>

      {notice.message ? (
        <div className={`notice notice-${notice.tone}`}>{notice.message}</div>
      ) : null}

      {!browserSupportsContinuousListening && browserSupportsSpeechRecognition ? (
        <div className="notice notice-info">
          Continuous listening may stop after a pause in this browser.
        </div>
      ) : null}

      <div className="toolbar">
        <button
          type="button"
          disabled={!canStart || listening}
          onClick={startListening}
        >
          Start live
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!listening}
          onClick={stopListening}
        >
          Stop
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!hasTranscript}
          onClick={resetTranscript}
        >
          Clear
        </button>
      </div>

      <div className="text-block transcript-block" aria-live="polite">
        {hasTranscript ? (
          <>
            {finalTranscript ? <span>{finalTranscript}</span> : null}
            {interimTranscript ? (
              <span className="transcript-interim">{` ${interimTranscript}`}</span>
            ) : null}
          </>
        ) : (
          <span className="muted">Transcript will appear here.</span>
        )}
      </div>
    </section>
  );
};

export const mountLiveSpeechRecognition = (rootElement) => {
  if (!rootElement) return null;

  const root = createRoot(rootElement);
  root.render(<LiveSpeechRecognitionPanel />);
  return root;
};
