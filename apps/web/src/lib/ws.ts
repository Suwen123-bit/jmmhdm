import { getAccessToken } from './api';

type Listener = (event: string, data: any) => void;

class WSClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subscriptions = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;

  connect(): void {
    if (this.socket || this.isConnecting) return;
    this.isConnecting = true;
    const token = getAccessToken();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    // 通过 Sec-WebSocket-Protocol 携带 token（避免 URL 泄漏到 referer/日志）
    const protocols = token ? [`bearer.${token}`] : undefined;
    const sock = new WebSocket(url, protocols);
    this.socket = sock;
    sock.onopen = () => {
      this.isConnecting = false;
      // 重新订阅
      if (this.subscriptions.size > 0) {
        sock.send(JSON.stringify({ action: 'subscribe', channels: [...this.subscriptions] }));
      }
      this.heartbeatTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ action: 'ping' }));
        }
      }, 25_000);
    };
    sock.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        for (const l of this.listeners) l(msg.event, msg.data);
      } catch {
        // ignore
      }
    };
    sock.onclose = () => {
      this.cleanup();
      this.scheduleReconnect();
    };
    sock.onerror = () => {
      sock.close();
    };
  }

  private cleanup(): void {
    this.socket = null;
    this.isConnecting = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe(channels: string[]): void {
    for (const ch of channels) this.subscriptions.add(ch);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'subscribe', channels }));
    }
  }

  unsubscribe(channels: string[]): void {
    for (const ch of channels) this.subscriptions.delete(ch);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'unsubscribe', channels }));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.subscriptions.clear();
    this.socket?.close();
    this.cleanup();
  }
}

export const ws = new WSClient();
