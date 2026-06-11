import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import authRouter from './routes/auth.route';
import deepgramRouter from './routes/deepgram.route';
import embeddingRouter from './routes/embedding.route';
import recordingsRouter from './routes/recordings.route';
import { ApiError } from './utils/ApiError.js';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});
app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Backend is running!');
});

app.use('/auth', authRouter);
app.use('/deepgram', deepgramRouter);
app.use('/embedding', embeddingRouter);
app.use('/recordings', recordingsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;

  res.status(statusCode).json({
    statusCode,
    data: err instanceof ApiError ? err.data : null,
    message: err.message || 'Internal Server Error',
    success: false,
    errors: err instanceof ApiError ? err.errors : [],
  });
});

export { app };
