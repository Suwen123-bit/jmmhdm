import IORedis from 'ioredis';
import { env } from './config/env.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const subscriber = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const publisher = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// BullMQ 需要 maxRetriesPerRequest=null
export const bullConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

redis.on('error', (e) => console.error('[redis]', e.message));
subscriber.on('error', (e) => console.error('[redis sub]', e.message));
publisher.on('error', (e) => console.error('[redis pub]', e.message));

// Pub/Sub 频道
export const CHANNELS = {
  CONFIG_UPDATED: 'config:updated',
  PRICE_TICK: 'price:tick',
  USER_EVENT: 'user:event',
  BROADCAST: 'broadcast',
} as const;
