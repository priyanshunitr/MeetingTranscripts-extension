import type { ConnectionOptions } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

const parseRedisPort = () => {
  const rawPort = process.env.REDIS_PORT;

  if (!rawPort) return 6379;

  const port = Number(rawPort);
  return Number.isInteger(port) ? port : 6379;
};

//----------------------------------------------------------------------------------------------------------------

const parseRedisUrl = (rawUrl: string): ConnectionOptions => {
  const redisUrl = new URL(rawUrl);
  const port = redisUrl.port ? Number(redisUrl.port) : 6379;
  const database = redisUrl.pathname.replace("/", "");
  const connection: ConnectionOptions = {
    host: redisUrl.hostname,
    port: Number.isInteger(port) ? port : 6379,
  };

  if (redisUrl.username) {
    connection.username = decodeURIComponent(redisUrl.username);
  }

  if (redisUrl.password) {
    connection.password = decodeURIComponent(redisUrl.password);
  }

  if (database) {
    connection.db = Number(database);
  }

  if (redisUrl.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
};

//----------------------------------------------------------------------------------------------------------------

const redisUrl = process.env.REDIS_URL?.trim();

export const redisConnection: ConnectionOptions = redisUrl
  ? parseRedisUrl(redisUrl)
  : {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: parseRedisPort(),
      password: process.env.REDIS_PASSWORD || undefined,
    };
