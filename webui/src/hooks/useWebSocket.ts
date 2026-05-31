import { useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS  = 10_000;

export default function useWebSocket(
  enabled: boolean,
  onMessage: (data: any) => void
) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!enabled) return;

    const getWsUrl = () => {
      let wsUrl = API_URL;
      if (wsUrl.startsWith('https://')) {
        wsUrl = wsUrl.replace('https://', 'wss://');
      } else {
        wsUrl = wsUrl.replace('http://', 'ws://');
      }
      return `${wsUrl}/ws`;
    };

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const clearTimers = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    };

    const scheduleReconnect = () => {
      clearTimers();
      if (!destroyed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    const connect = () => {
      if (destroyed) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        heartbeatTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            scheduleReconnect();
            return;
          }
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            scheduleReconnect();
            return;
          }
          pongTimer = setTimeout(() => {
            console.warn('[WS] Heartbeat timeout — reconnecting');
            ws.close();
            scheduleReconnect();
          }, HEARTBEAT_TIMEOUT_MS);
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data?.type === 'pong') {
            if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
            return;
          }

          onMessageRef.current(data);
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onclose = () => {
        clearTimers();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimers();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };

  }, [enabled]);
}