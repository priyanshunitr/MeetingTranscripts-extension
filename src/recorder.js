// recorder.js — runs in a persistent extension window so getDisplayMedia remains active
let mediaRecorder = null;
let recordedChunks = [];
const recBtn = document.getElementById('recToggle');
const preview = document.getElementById('preview');
const downloadLink = document.getElementById('downloadLink');

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    preview.srcObject = stream;
    await preview.play().catch(()=>{});

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) recordedChunks.push(ev.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = 'screen-recording.webm';
      downloadLink.style.display = 'inline';
    };

    mediaRecorder.start();
    recBtn.textContent = 'Stop Recording';
  } catch (err) {
    console.error('startRecording failed', err);
    alert('Screen capture failed: ' + (err && err.message ? err.message : err));
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (preview.srcObject) {
    const tracks = preview.srcObject.getTracks();
    tracks.forEach(t => t.stop());
    preview.srcObject = null;
  }
  recBtn.textContent = 'Start Recording';
}

recBtn?.addEventListener('click', () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') startRecording();
  else stopRecording();
});
