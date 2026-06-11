const DEFAULT_BACKEND_URL = 'http://localhost:3000';
const CONFIG_KEY = 'meetingTranscriptsConfig';

const defaultConfig = {
  backendUrl: DEFAULT_BACKEND_URL,
  authToken: '',
};

const hasChromeStorage = () => {
  return Boolean(globalThis.chrome?.storage?.local);
};

const normalizeBackendUrl = (value) => {
  const trimmed = String(value || '').trim();

  if (!trimmed) return DEFAULT_BACKEND_URL;

  return trimmed.replace(/\/+$/, '');
};

export const getConfig = async () => {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(CONFIG_KEY, (result) => {
        resolve({
          ...defaultConfig,
          ...(result[CONFIG_KEY] || {}),
          backendUrl: normalizeBackendUrl(result[CONFIG_KEY]?.backendUrl),
        });
      });
    });
  }

  try {
    const config = {
      ...defaultConfig,
      ...(JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')),
    };

    return {
      ...config,
      backendUrl: normalizeBackendUrl(config.backendUrl),
    };
  } catch (_err) {
    return defaultConfig;
  }
};

export const saveConfig = async (config) => {
  const nextConfig = {
    ...defaultConfig,
    ...config,
    backendUrl: normalizeBackendUrl(config.backendUrl),
    authToken: String(config.authToken || '').trim(),
  };

  if (hasChromeStorage()) {
    await new Promise((resolve) => {
      chrome.storage.local.set({ [CONFIG_KEY]: nextConfig }, resolve);
    });
    return nextConfig;
  }

  localStorage.setItem(CONFIG_KEY, JSON.stringify(nextConfig));
  return nextConfig;
};

const buildUrl = (backendUrl, path) => {
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeBackendUrl(backendUrl)}${normalizedPath}`;
};

const readResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (response.status === 204) return null;
  if (contentType.includes('application/json')) return response.json();

  return response.text();
};

export const apiRequest = async (path, options = {}) => {
  const config = await getConfig();
  const headers = new Headers(options.headers || {});
  const shouldSendJson =
    options.body &&
    typeof options.body === 'object' &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob);

  if (shouldSendJson && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.auth !== false && config.authToken) {
    headers.set('Authorization', `Bearer ${config.authToken}`);
  }

  const response = await fetch(buildUrl(config.backendUrl, path), {
    ...options,
    headers,
    body: shouldSendJson ? JSON.stringify(options.body) : options.body,
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    const message =
      body && typeof body === 'object'
        ? body.message || JSON.stringify(body)
        : body || `Request failed with ${response.status}`;

    throw new Error(message);
  }

  if (body && typeof body === 'object' && 'success' in body) {
    if (!body.success) {
      throw new Error(body.message || 'Request failed');
    }

    return body.data;
  }

  return body;
};

export const api = {
  health: () => apiRequest('/', { auth: false }),
  me: () => apiRequest('/auth/me'),
  listRecordings: () => apiRequest('/recordings'),
  createRecording: (input) =>
    apiRequest('/recordings', {
      method: 'POST',
      body: input,
    }),
  getRecording: (recordingId) => apiRequest(`/recordings/${recordingId}`),
  updateRecording: (recordingId, input) =>
    apiRequest(`/recordings/${recordingId}`, {
      method: 'PATCH',
      body: input,
    }),
  deleteRecording: (recordingId) =>
    apiRequest(`/recordings/${recordingId}`, {
      method: 'DELETE',
    }),
  createUploadUrl: (recordingId, input) =>
    apiRequest(`/recordings/${recordingId}/upload-url`, {
      method: 'POST',
      body: input,
    }),
  completeUpload: (recordingId, input) =>
    apiRequest(`/recordings/${recordingId}/upload-complete`, {
      method: 'POST',
      body: input,
    }),
  completeBrowserTranscript: (recordingId, input) =>
    apiRequest(`/recordings/${recordingId}/browser-transcript-complete`, {
      method: 'POST',
      body: input,
    }),
  searchRecordings: ({ q, mode = 'hybrid', limit = 10 }) =>
    apiRequest(
      `/recordings/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(
        mode,
      )}&limit=${encodeURIComponent(String(limit))}`,
    ),
  importGoogleMeet: (input) =>
    apiRequest('/recordings/import/google-meet', {
      method: 'POST',
      body: input,
    }),
  listChats: (recordingId) => apiRequest(`/recordings/${recordingId}/chats`),
  createChat: (recordingId, input) =>
    apiRequest(`/recordings/${recordingId}/chats`, {
      method: 'POST',
      body: input,
    }),
  getChat: (recordingId, chatId) =>
    apiRequest(`/recordings/${recordingId}/chats/${chatId}`),
  deleteChat: (recordingId, chatId) =>
    apiRequest(`/recordings/${recordingId}/chats/${chatId}`, {
      method: 'DELETE',
    }),
  sendChatMessage: (recordingId, chatId, input) =>
    apiRequest(`/recordings/${recordingId}/chats/${chatId}/messages`, {
      method: 'POST',
      body: input,
    }),
};

export const uploadToSignedUrl = async (upload, blob) => {
  const response = await fetch(upload.uploadUrl, {
    method: upload.method || 'PUT',
    headers: upload.headers || {},
    body: blob,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Upload failed with ${response.status}`);
  }
};

export const getExtensionUrl = (page, params = {}) => {
  const query = new URLSearchParams(params).toString();
  const path = query ? `${page}?${query}` : page;

  if (globalThis.chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }

  return path;
};

export const openExtensionPage = (page, params = {}) => {
  const url = getExtensionUrl(page, params);

  if (globalThis.chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, '_blank', 'noopener');
};

export const openRecorderWindow = () => {
  const url = getExtensionUrl('recorder.html');

  if (globalThis.chrome?.windows?.create) {
    chrome.windows.create({
      url,
      type: 'popup',
      width: 760,
      height: 680,
    });
    return;
  }

  window.open(url, '_blank', 'width=760,height=680');
};
