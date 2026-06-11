import {
  api,
  getConfig,
  openExtensionPage,
  openRecorderWindow,
} from './api.js';
import {
  $,
  escapeHtml,
  formatDate,
  formatDuration,
  setText,
  showMessage,
  statusClass,
} from './ui.js';

const backendStatus = $('#backendStatus');
const popupMessage = $('#popupMessage');
const recentRecordings = $('#recentRecordings');

const renderRecentRecordings = (recordings) => {
  if (!recentRecordings) return;

  if (!recordings.length) {
    recentRecordings.innerHTML = '<div class="empty-state">No recordings found.</div>';
    return;
  }

  recentRecordings.innerHTML = recordings
    .slice(0, 5)
    .map((recording) => {
      const duration = formatDuration(recording.audio?.durationSeconds);
      const date = formatDate(recording.createdAt);

      return `
        <button class="card" data-recording-id="${escapeHtml(recording.id)}">
          <strong>${escapeHtml(recording.title || 'Untitled Recording')}</strong>
          <span class="status-pill ${statusClass(recording.status)}">${escapeHtml(recording.status)}</span>
          <span class="muted small">${escapeHtml(duration)} · ${escapeHtml(date)}</span>
        </button>
      `;
    })
    .join('');

  recentRecordings.querySelectorAll('[data-recording-id]').forEach((button) => {
    button.addEventListener('click', () => {
      openExtensionPage('recordings.html', {
        id: button.dataset.recordingId,
      });
    });
  });
};

const loadPopup = async () => {
  showMessage(popupMessage, '', 'info');
  setText(backendStatus, 'Checking backend...');

  try {
    const config = await getConfig();
    await api.health();

    if (!config.authToken) {
      setText(backendStatus, 'Backend reachable');
      showMessage(
        popupMessage,
        'Add a Firebase ID token in Settings to load recordings.',
        'info',
      );
      renderRecentRecordings([]);
      return;
    }

    const user = await api.me();
    const recordings = await api.listRecordings();
    const label = user.email || user.name || user.id || 'authenticated';

    setText(backendStatus, label);
    renderRecentRecordings(recordings);
  } catch (err) {
    setText(backendStatus, 'Backend unavailable');
    showMessage(popupMessage, err.message || 'Unable to reach backend.', 'error');
    renderRecentRecordings([]);
  }
};

$('#startRecording')?.addEventListener('click', () => {
  openRecorderWindow();
  try {
    window.close();
  } catch (_err) {
    // Popup close can fail outside Chrome extension contexts.
  }
});

$('#openDashboard')?.addEventListener('click', () => openExtensionPage('recordings.html'));
$('#openSettings')?.addEventListener('click', () => openExtensionPage('settings.html'));
$('#refreshPopup')?.addEventListener('click', loadPopup);

loadPopup();
