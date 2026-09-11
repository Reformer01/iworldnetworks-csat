import IORedis from 'ioredis';

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new IORedis(url, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('[redis] Connection error:', err);
    });

    redis.on('connect', () => {
      console.log('[redis] Connected');
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}