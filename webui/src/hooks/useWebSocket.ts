import { useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function useWebSocket(
  enabled: boolean,
  onMessage: (data: any) => void
) {
  // Kluczowa poprawka: trzymamy aktualny callback w ref.
  // Dzięki temu useEffect NIE widzi `onMessage` jako zmiennej dependency
  // i nie restartuje połączenia WS przy każdym re-renderze komponentu.
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
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(getWsUrl());

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Wywołujemy ZAWSZE aktualną wersję callbacku przez ref
          onMessageRef.current(data);
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };

      ws.onclose = () => {
        if (!destroyed) {
          // Automatyczny reconnect po 2s gdy połączenie padnie
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };

  // CELOWO tylko `enabled` jako dependency - onMessage obsługujemy przez ref
  }, [enabled]);
}