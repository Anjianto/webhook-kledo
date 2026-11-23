// Penyimpanan secret dan log webhook per channel.
// Vercel menjalankan server sebagai serverless function, jadi memory tidak bertahan antar request.
// Karena itu production memakai Upstash Redis. Mode memory hanya untuk dev lokal.
import { Redis } from "@upstash/redis";

export const MAX_EVENTS = 100;
export const TTL_SECONDS = 7 * 24 * 60 * 60;

const secretKey = (channelId) => `webhook:${channelId}:secret`;
const eventsKey = (channelId) => `webhook:${channelId}:events`;

function createRedisStore(redis) {
  return {
    kind: "redis",

    async setSecret(channelId, secret) {
      await redis.set(secretKey(channelId), secret, { ex: TTL_SECONDS });
    },

    async getSecret(channelId) {
      return redis.get(secretKey(channelId));
    },

    async addEvent(channelId, event) {
      const key = eventsKey(channelId);

      // Pipeline menggabungkan tiga command dalam satu request HTTP ke Upstash.
      await redis
        .pipeline()
        .lpush(key, JSON.stringify(event))
        .ltrim(key, 0, MAX_EVENTS - 1)
        .expire(key, TTL_SECONDS)
        .exec();
    },

    async listEvents(channelId) {
      const items = await redis.lrange(eventsKey(channelId), 0, MAX_EVENTS - 1);

      return items.map((item) => JSON.parse(item));
    },

    async clearEvents(channelId) {
      await redis.del(eventsKey(channelId));
    },
  };
}

function createMemoryStore() {
  const secrets = new Map();
  const events = new Map();

  return {
    kind: "memory",

    async setSecret(channelId, secret) {
      secrets.set(channelId, secret);
    },

    async getSecret(channelId) {
      return secrets.get(channelId) ?? null;
    },

    async addEvent(channelId, event) {
      const list = events.get(channelId) ?? [];

      list.unshift(event);
      events.set(channelId, list.slice(0, MAX_EVENTS));
    },

    async listEvents(channelId) {
      return events.get(channelId) ?? [];
    },

    async clearEvents(channelId) {
      events.delete(channelId);
    },
  };
}

export function createStore(env = process.env) {
  // Integrasi Upstash di Vercel Marketplace memberi nama env KV_REST_API_*.
  // Setup manual dari dashboard Upstash memberi nama env UPSTASH_REDIS_REST_*.
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    // Nilai disimpan sebagai string JSON, jadi deserialisasi otomatis dimatikan.
    const redis = new Redis({ url, token, automaticDeserialization: false });

    return createRedisStore(redis);
  }

  return createMemoryStore();
}
