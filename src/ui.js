export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => {
  return Array.from(root.querySelectorAll(selector));
};

export const setText = (selector, value, root = document) => {
  const element = typeof selector === 'string' ? $(selector, root) : selector;

  if (element) element.textContent = value ?? '';
};

export const setVisible = (selector, visible, root = document) => {
  const element = typeof selector === 'string' ? $(selector, root) : selector;

  if (element) element.hidden = !visible;
};

export const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const formatBytes = (bytes) => {
  const value = Number(bytes || 0);

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export const formatDate = (value) => {
  if (!value) return 'Not available';

  const seconds = value._seconds ?? value.seconds;
  const date = typeof seconds === 'number' ? new Date(seconds * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleString();
};

export const statusClass = (status) => {
  if (status === 'completed') return 'status-completed';
  if (status === 'failed') return 'status-failed';
  if (status === 'uploading' || status === 'uploaded') return 'status-uploading';

  return 'status-processing';
};

export const showMessage = (element, message, tone = 'info') => {
  if (!element) return;

  element.textContent = message || '';
  element.className = `notice notice-${tone}`;
  element.hidden = !message;
};
