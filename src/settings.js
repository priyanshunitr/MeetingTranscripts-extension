import { api, getConfig, openExtensionPage, saveConfig } from './api.js';
import { $, showMessage } from './ui.js';

const backendUrlInput = $('#backendUrl');
const authTokenInput = $('#authToken');
const message = $('#settingsMessage');

const loadSettings = async () => {
  const config = await getConfig();

  backendUrlInput.value = config.backendUrl;
  authTokenInput.value = config.authToken;
};

const readForm = () => {
  return {
    backendUrl: backendUrlInput.value,
    authToken: authTokenInput.value,
  };
};

const saveSettings = async () => {
  const config = await saveConfig(readForm());

  backendUrlInput.value = config.backendUrl;
  authTokenInput.value = config.authToken;
  showMessage(message, 'Settings saved.', 'success');
};

const testConnection = async () => {
  await saveSettings();
  showMessage(message, 'Testing backend connection...', 'info');

  try {
    const health = await api.health();
    const user = authTokenInput.value.trim() ? await api.me() : null;
    const suffix = user?.email || user?.name || user?.id || 'token accepted';

    showMessage(
      message,
      user ? `Backend reachable. Authenticated as ${suffix}.` : `Backend reachable: ${health}`,
      'success',
    );
  } catch (err) {
    showMessage(message, err.message || 'Connection test failed.', 'error');
  }
};

$('#saveSettings')?.addEventListener('click', saveSettings);
$('#testConnection')?.addEventListener('click', testConnection);
$('#clearToken')?.addEventListener('click', async () => {
  authTokenInput.value = '';
  await saveSettings();
});
$('#openDashboard')?.addEventListener('click', () => openExtensionPage('recordings.html'));

loadSettings();
