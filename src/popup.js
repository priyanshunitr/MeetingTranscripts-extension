const openRecorderWindow = () => {
  const url = chrome.runtime.getURL('recorder.html');

  chrome.windows.create({
    url,
    type: 'popup',
    width: 760,
    height: 620,
  });
};

document.getElementById('startRecording')?.addEventListener('click', () => {
  openRecorderWindow();

  try {
    window.close();
  } catch (_err) {
    // Popup close can fail outside Chrome extension contexts.
  }
});
