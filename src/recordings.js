import { api, getConfig, openExtensionPage, openRecorderWindow } from './api.js';
import {
  $,
  escapeHtml,
  formatBytes,
  formatDate,
  formatDuration,
  setText,
  setVisible,
  showMessage,
  statusClass,
} from './ui.js';

const state = {
  recordings: [],
  searchResults: null,
  selectedId: new URLSearchParams(location.search).get('id') || '',
  selectedRecording: null,
  chats: [],
  selectedChatId: '',
};

const dashboardMessage = $('#dashboardMessage');
const recordingList = $('#recordingList');
const detailContent = $('#detailContent');
const emptyDetail = $('#emptyDetail');
const aiPanel = $('#aiPanel');
const chatPanel = $('#chatPanel');
const chatMessage = $('#chatMessage');

const getTimestamp = (value) => {
  const seconds = value?._seconds ?? value?.seconds;

  if (typeof seconds === 'number') return seconds;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
};

const sortedRecordings = (recordings) => {
  return [...recordings].sort((a, b) => {
    return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
  });
};

const getSearchRows = (result) => {
  if (!result) return [];

  const rows = new Map();
  const put = (id, row) => {
    if (!id || rows.has(id)) return;
    rows.set(id, row);
  };

  (result.keywordResults || []).forEach((item) => {
    put(item.recordingId, {
      id: item.recordingId,
      title: item.title || item.recordingId,
      status: item.status || '',
      subtitle: `Keyword match: ${(item.matchedFields || []).join(', ')}`,
      preview: item.textPreview || '',
    });
  });

  (result.semanticResults || []).forEach((item) => {
    put(item.recordingId, {
      id: item.recordingId,
      title: item.title || item.recordingTitle || item.recordingId,
      status: item.status || '',
      subtitle: item.score ? `Semantic score: ${Number(item.score).toFixed(3)}` : 'Semantic match',
      preview: item.textPreview || item.text || '',
    });
  });

  return Array.from(rows.values());
};

const renderRecordingList = () => {
  const rows = state.searchResults
    ? getSearchRows(state.searchResults)
    : sortedRecordings(state.recordings).map((recording) => ({
        id: recording.id,
        title: recording.title,
        status: recording.status,
        subtitle: `${formatDuration(recording.audio?.durationSeconds)} · ${formatDate(
          recording.createdAt,
        )}`,
        preview: recording.description,
      }));

  if (!rows.length) {
    recordingList.innerHTML = '<div class="empty-state">No recordings found.</div>';
    return;
  }

  recordingList.innerHTML = rows
    .map((row) => {
      const active = row.id === state.selectedId ? ' is-active' : '';
      const status = row.status
        ? `<span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span>`
        : '';

      return `
        <button class="card${active}" data-recording-id="${escapeHtml(row.id)}">
          <strong>${escapeHtml(row.title || 'Untitled Recording')}</strong>
          ${status}
          <span class="muted small">${escapeHtml(row.subtitle || row.id)}</span>
          ${
            row.preview
              ? `<span class="small">${escapeHtml(String(row.preview).slice(0, 180))}</span>`
              : ''
          }
        </button>
      `;
    })
    .join('');

  recordingList.querySelectorAll('[data-recording-id]').forEach((button) => {
    button.addEventListener('click', () => selectRecording(button.dataset.recordingId));
  });
};

const renderListBlock = (items) => {
  if (!items?.length) return '<span class="muted">Not available</span>';

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const renderActionItems = (items) => {
  if (!items?.length) return '<span class="muted">Not available</span>';

  return `<ul>${items
    .map((item) => {
      const owner = item.owner ? ` · ${item.owner}` : '';
      const due = item.dueDate ? ` · ${item.dueDate}` : '';
      const status = item.status ? ` · ${item.status}` : '';
      return `<li>${escapeHtml(item.task || '')}${escapeHtml(owner)}${escapeHtml(due)}${escapeHtml(
        status,
      )}</li>`;
    })
    .join('')}</ul>`;
};

const renderAi = (recording) => {
  const transcript = recording.transcript || {};
  const ai = recording.ai || {};

  setVisible(aiPanel, true);
  $('#shortSummary').innerHTML = escapeHtml(ai.shortSummary || ai.summary || 'Not available');
  $('#transcriptText').innerHTML = escapeHtml(transcript.fullText || 'Not available');
  $('#keyPoints').innerHTML = renderListBlock(ai.keyPoints);
  $('#decisions').innerHTML = renderListBlock(ai.decisions);
  $('#actionItems').innerHTML = renderActionItems(ai.actionItems);
};

const renderDetail = (recording) => {
  state.selectedRecording = recording;
  setVisible(emptyDetail, false);
  setVisible(detailContent, true);

  setText('#detailTitle', recording.title || 'Untitled Recording');
  setText('#detailDuration', formatDuration(recording.audio?.durationSeconds));
  setText('#detailSize', formatBytes(recording.audio?.fileSize));
  setText('#detailCreated', formatDate(recording.createdAt));
  setText('#detailType', recording.type || 'meeting');

  const status = $('#detailStatus');
  status.textContent = recording.status || 'unknown';
  status.className = `status-pill ${statusClass(recording.status)}`;

  $('#metadataTitle').value = recording.title || '';
  $('#metadataType').value = recording.type || 'meeting';
  $('#metadataDescription').value = recording.description || '';

  renderAi(recording);
  renderChatShell(recording);
};

const renderChatShell = (recording) => {
  setVisible(chatPanel, true);

  if (recording.status !== 'completed') {
    showMessage(
      chatMessage,
      'Chat is available after backend processing reaches completed.',
      'info',
    );
    $('#chatInput').disabled = true;
    $('#sendChat').disabled = true;
    $('#newChat').disabled = true;
    $('#chatSelect').innerHTML = '<option>No chat sessions</option>';
    $('#chatLog').innerHTML = '';
    return;
  }

  showMessage(chatMessage, '', 'info');
  $('#chatInput').disabled = false;
  $('#sendChat').disabled = false;
  $('#newChat').disabled = false;
  loadChats(recording.id);
};

const renderChats = () => {
  const select = $('#chatSelect');

  if (!state.chats.length) {
    select.innerHTML = '<option value="">No chat sessions</option>';
    $('#chatLog').innerHTML = '<div class="empty-state">Create a chat to ask questions.</div>';
    return;
  }

  select.innerHTML = state.chats
    .map((chat) => {
      const selected = chat.id === state.selectedChatId ? ' selected' : '';
      return `<option value="${escapeHtml(chat.id)}"${selected}>${escapeHtml(chat.title)}</option>`;
    })
    .join('');
};

const renderChatMessages = (messages = []) => {
  const chatLog = $('#chatLog');

  if (!messages.length) {
    chatLog.innerHTML = '<div class="empty-state">No messages yet.</div>';
    return;
  }

  chatLog.innerHTML = messages
    .map((message) => {
      const role = message.role === 'assistant' ? 'assistant' : 'user';
      const sources = message.sources?.length
        ? `<div class="small muted">Sources: ${escapeHtml(
            message.sources.map((source) => source.textPreview).join(' | '),
          )}</div>`
        : '';

      return `
        <div class="message message-${role}">
          <strong>${role === 'assistant' ? 'Assistant' : 'You'}</strong>
          <div>${escapeHtml(message.content)}</div>
          ${sources}
        </div>
      `;
    })
    .join('');
  chatLog.scrollTop = chatLog.scrollHeight;
};

const requireAuthConfig = async () => {
  const config = await getConfig();

  if (!config.authToken) {
    throw new Error('Add a Firebase ID token in Settings before using backend routes.');
  }
};

const loadRecordings = async () => {
  try {
    await requireAuthConfig();
    showMessage(dashboardMessage, 'Loading recordings...', 'info');
    state.searchResults = null;
    state.recordings = await api.listRecordings();
    renderRecordingList();

    if (state.selectedId) {
      await selectRecording(state.selectedId, { skipListRender: true });
    } else if (state.recordings[0]) {
      await selectRecording(sortedRecordings(state.recordings)[0].id, {
        skipListRender: true,
      });
    } else {
      setVisible(emptyDetail, true);
      setVisible(detailContent, false);
      setVisible(aiPanel, false);
      setVisible(chatPanel, false);
    }

    showMessage(dashboardMessage, '', 'info');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Unable to load recordings.', 'error');
    renderRecordingList();
  }
};

async function selectRecording(recordingId, options = {}) {
  if (!recordingId) return;

  try {
    state.selectedId = recordingId;
    history.replaceState(null, '', `recordings.html?id=${encodeURIComponent(recordingId)}`);

    if (!options.skipListRender) {
      renderRecordingList();
    }

    showMessage(dashboardMessage, 'Loading recording...', 'info');
    const recording = await api.getRecording(recordingId);
    renderDetail(recording);
    showMessage(dashboardMessage, '', 'info');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Unable to load recording.', 'error');
  }
}

const runSearch = async () => {
  const query = $('#searchInput').value.trim();

  if (!query) {
    await loadRecordings();
    return;
  }

  try {
    await requireAuthConfig();
    showMessage(dashboardMessage, 'Searching recordings...', 'info');
    state.searchResults = await api.searchRecordings({
      q: query,
      mode: $('#searchMode').value,
      limit: 20,
    });
    renderRecordingList();
    showMessage(dashboardMessage, '', 'info');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Search failed.', 'error');
  }
};

const saveMetadata = async (event) => {
  event.preventDefault();

  if (!state.selectedId) return;

  try {
    showMessage(dashboardMessage, 'Saving metadata...', 'info');
    await api.updateRecording(state.selectedId, {
      title: $('#metadataTitle').value.trim(),
      description: $('#metadataDescription').value.trim(),
      type: $('#metadataType').value,
    });
    await selectRecording(state.selectedId);
    state.recordings = await api.listRecordings();
    renderRecordingList();
    showMessage(dashboardMessage, 'Metadata saved.', 'success');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Metadata save failed.', 'error');
  }
};

const deleteSelectedRecording = async () => {
  if (!state.selectedId) return;

  const confirmed = window.confirm('Delete this recording?');
  if (!confirmed) return;

  try {
    showMessage(dashboardMessage, 'Deleting recording...', 'info');
    await api.deleteRecording(state.selectedId);
    state.selectedId = '';
    state.selectedRecording = null;
    history.replaceState(null, '', 'recordings.html');
    await loadRecordings();
    showMessage(dashboardMessage, 'Recording deleted.', 'success');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Delete failed.', 'error');
  }
};

async function loadChats(recordingId) {
  try {
    state.chats = await api.listChats(recordingId);
    state.selectedChatId = state.selectedChatId || state.chats[0]?.id || '';
    renderChats();

    if (state.selectedChatId) {
      await loadSelectedChat();
    }
  } catch (err) {
    showMessage(chatMessage, err.message || 'Unable to load chats.', 'error');
  }
}

const createChat = async () => {
  if (!state.selectedId) return null;

  const chat = await api.createChat(state.selectedId, {
    title: `Chat ${new Date().toLocaleTimeString()}`,
  });

  state.selectedChatId = chat.id;
  await loadChats(state.selectedId);
  return chat;
};

const loadSelectedChat = async () => {
  if (!state.selectedId || !state.selectedChatId) {
    renderChatMessages([]);
    return;
  }

  try {
    const chat = await api.getChat(state.selectedId, state.selectedChatId);
    renderChatMessages(chat.messages || []);
  } catch (err) {
    showMessage(chatMessage, err.message || 'Unable to load chat.', 'error');
  }
};

const sendChatMessage = async () => {
  const input = $('#chatInput');
  const content = input.value.trim();

  if (!content || !state.selectedId) return;

  try {
    showMessage(chatMessage, 'Sending message...', 'info');

    if (!state.selectedChatId) {
      await createChat();
    }

    const result = await api.sendChatMessage(state.selectedId, state.selectedChatId, {
      content,
    });
    input.value = '';
    renderChatMessages([result.userMessage, result.assistantMessage].filter(Boolean));
    await loadSelectedChat();
    showMessage(chatMessage, '', 'info');
  } catch (err) {
    showMessage(chatMessage, err.message || 'Message failed.', 'error');
  }
};

const importMeet = async () => {
  const meetLinkOrCode = $('#meetLinkOrCode').value.trim();
  const googleAccessToken = $('#googleAccessToken').value.trim();

  if (!meetLinkOrCode || !googleAccessToken) {
    showMessage(dashboardMessage, 'Meet link/code and Google access token are required.', 'error');
    return;
  }

  try {
    showMessage(dashboardMessage, 'Importing Google Meet transcript...', 'info');
    const recording = await api.importGoogleMeet({
      meetLinkOrCode,
      googleAccessToken,
      title: $('#meetTitle').value.trim() || undefined,
      description: $('#meetDescription').value.trim(),
    });

    $('#meetLinkOrCode').value = '';
    $('#googleAccessToken').value = '';
    $('#meetTitle').value = '';
    $('#meetDescription').value = '';

    state.selectedId = recording.id;
    await loadRecordings();
    await selectRecording(recording.id);
    showMessage(dashboardMessage, 'Google Meet transcript imported.', 'success');
  } catch (err) {
    showMessage(dashboardMessage, err.message || 'Import failed.', 'error');
  }
};

$('#refreshRecordings')?.addEventListener('click', loadRecordings);
$('#runSearch')?.addEventListener('click', runSearch);
$('#clearSearch')?.addEventListener('click', async () => {
  $('#searchInput').value = '';
  await loadRecordings();
});
$('#searchInput')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch();
});
$('#metadataForm')?.addEventListener('submit', saveMetadata);
$('#reloadDetail')?.addEventListener('click', () => selectRecording(state.selectedId));
$('#deleteRecording')?.addEventListener('click', deleteSelectedRecording);
$('#newChat')?.addEventListener('click', async () => {
  try {
    showMessage(chatMessage, 'Creating chat...', 'info');
    await createChat();
    showMessage(chatMessage, '', 'info');
  } catch (err) {
    showMessage(chatMessage, err.message || 'Unable to create chat.', 'error');
  }
});
$('#chatSelect')?.addEventListener('change', async (event) => {
  state.selectedChatId = event.target.value;
  await loadSelectedChat();
});
$('#sendChat')?.addEventListener('click', sendChatMessage);
$('#chatInput')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    sendChatMessage();
  }
});
$('#importMeet')?.addEventListener('click', importMeet);
$('#openRecorder')?.addEventListener('click', openRecorderWindow);
$('#openSettings')?.addEventListener('click', () => openExtensionPage('settings.html'));

loadRecordings();
