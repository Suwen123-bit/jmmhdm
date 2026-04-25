import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../utils/jwt.js';
import { subscriber, CHANNELS } from '../redis.js';
import { WS_EVENTS } from '@app/shared';
import { logger } from '../logger.js';

interface Client {
  socket: WebSocket;
  userId?: number;
  subscriptions: Set<string>; // 订阅的频道（如 price:btcusdt）
}

const clients = new Map<WebSocket, Client>();
let initialized = false;

export function initWsServer(httpServer: HttpServer): void {
  if (initialized) return;
  initialized = true;

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    // 必须 echo 客户端送上来的 bearer.* 子协议，否则浏览器会立即关闭连接
    handleProtocols: (protocols: Set<string>) => {
      for (const p of protocols) {
        if (p.startsWith('bearer.')) return p;
      }
      return false;
    },
  });

  wss.on('connection', (socket, req) => {
    // 优先：Sec-WebSocket-Protocol 子协议传 token（推荐）：'bearer.<JWT>'
    // 兼容：URL ?token=（已 deprecated，登记 warn）
    let token: string | null = null;
    const subproto = req.headers['sec-websocket-protocol'];
    if (typeof subproto === 'string') {
      const protos = subproto.split(',').map((s) => s.trim());
      const bearer = protos.find((p) => p.startsWith('bearer.'));
      if (bearer) token = bearer.slice('bearer.'.length);
    }
    if (!token) {
      const url = new URL(req.url ?? '/ws', 'http://localhost');
      const qToken = url.searchParams.get('token');
      if (qToken) {
        token = qToken;
        logger.warn('[ws] DEPRECATED: token via query string; use Sec-WebSocket-Protocol "bearer.<JWT>"');
      }
    }

    let userId: number | undefined;
    if (token) {
      try {
        const payload = verifyAccessToken(token);
        userId = payload.sub;
      } catch {
        // 匿名连接
      }
    }
    const client: Client = { socket, userId, subscriptions: new Set() };
    clients.set(socket, client);

    socket.send(JSON.stringify({ event: 'hello', data: { authenticated: !!userId } }));

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // 支持首条 message 鉴权 fallback：{ action: 'auth', token }
        if (msg.action === 'auth' && typeof msg.token === 'string' && !client.userId) {
          try {
            const payload = verifyAccessToken(msg.token);
            client.userId = payload.sub;
            socket.send(JSON.stringify({ event: 'authenticated', data: { ok: true } }));
          } catch {
            socket.send(JSON.stringify({ event: 'authenticated', data: { ok: false } }));
          }
          return;
        }
        // { action: 'subscribe', channels: ['price:btcusdt', 'kline:btcusdt:1min'] }
        if (msg.action === 'subscribe' && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) client.subscriptions.add(String(ch));
        } else if (msg.action === 'unsubscribe' && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) client.subscriptions.delete(String(ch));
        } else if (msg.action === 'ping') {
          socket.send(JSON.stringify({ event: 'pong', ts: Date.now() }));
        }
      } catch {
        // 忽略
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });
    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  // 心跳清理
  setInterval(() => {
    for (const [sock, client] of clients.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.ping();
        } catch {
          clients.delete(sock);
        }
      } else if (sock.readyState >= 2) {
        clients.delete(sock);
      }
    }
  }, 30_000);

  // 订阅 Redis 广播通道
  void subscriber.subscribe(CHANNELS.PRICE_TICK, CHANNELS.USER_EVENT, CHANNELS.BROADCAST);
  subscriber.on('message', (channel, message) => {
    if (channel === CHANNELS.PRICE_TICK) {
      try {
        const msg = JSON.parse(message);
        // 推送给订阅了 price:* 的客户端
        const data = msg.data;
        const symbol = data?.symbol;
        for (const client of clients.values()) {
          const matches =
            (msg.event === WS_EVENTS.PRICE_TICK && client.subscriptions.has(`price:${symbol}`)) ||
            (msg.event === WS_EVENTS.PRICE_KLINE &&
              client.subscriptions.has(`kline:${symbol}:${data.interval}`));
          if (matches && client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(message);
          }
        }
      } catch {
        // ignore
      }
    } else if (channel === CHANNELS.USER_EVENT) {
      try {
        const msg = JSON.parse(message);
        const targetUserId: number = msg.userId;
        const payload = JSON.stringify({ event: msg.event, data: msg.data });
        for (const client of clients.values()) {
          if (client.userId === targetUserId && client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(payload);
          }
        }
      } catch {
        // ignore
      }
    } else if (channel === CHANNELS.BROADCAST) {
      // 全站广播
      for (const client of clients.values()) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(message);
        }
      }
    }
  });

  logger.info('[ws] server initialized at /ws');
}
