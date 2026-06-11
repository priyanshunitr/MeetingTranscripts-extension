import { app } from './app';
import { startRecordingWorker } from './jobs/recording.worker';

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

app.listen(port, host, () => {
  if (process.env.START_RECORDING_WORKER !== 'false') {
    startRecordingWorker();
  }

  console.log(`Backend listening at http://localhost:${port}`);
});
