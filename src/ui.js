export const $ = (selector, root = document) => root.querySelector(selector);

export const setText = (selector, value, root = document) => {
  const element = typeof selector === 'string' ? $(selector, root) : selector;

  if (element) element.textContent = value ?? '';
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

export const showMessage = (element, message, tone = 'info') => {
  if (!element) return;

  element.textContent = message || '';
  element.className = `notice notice-${tone}`;
  element.hidden = !message;
};
