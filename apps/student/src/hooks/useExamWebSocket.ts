/**
 * WebSocket connection to /ws with exponential backoff reconnect.
 *
 * - Authenticates via the Sec-WebSocket-Protocol "bearer.<jwt>" subprotocol
 *   (so the token never appears in URL logs).
 * - Reconnect delay: 1s, 2s, 4s, 8s, 15s, 30s (capped) with ±20% jitter.
 * - Calls onOpen/onMessage/onClose. The hook returns send() and a status.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

interface Opts {
  url: string;
  token: string | null;
  onMessage?: (ev: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  enabled?: boolean;
}

const DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];
const MAX_DELAY = 30000;

function jitter(ms: number) {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

export function useExamWebSocket(opts: Opts) {
  const [status, setStatus] = useState<WsStatus>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUserRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const connect = useCallback(() => {
    const o = optsRef.current;
    if (!o.enabled || !o.token) return;

    setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');
    const protocols = [`bearer.${o.token}`];
    let ws: WebSocket;
    try {
      ws = new WebSocket(o.url, protocols);
    } catch {
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus('open');
      o.onOpen?.();
    };
    if (o.onMessage) ws.onmessage = o.onMessage;
    ws.onclose = (ev) => {
      setStatus('closed');
      o.onClose?.(ev);
      if (!closedByUserRef.current) scheduleReconnect();
    };
    ws.onerror = () => {
      ws.close();
    };
  }, []);

  function scheduleReconnect() {
    const i = Math.min(attemptRef.current, DELAYS.length - 1);
    const base = DELAYS[i] ?? MAX_DELAY;
    attemptRef.current += 1;
    timerRef.current = setTimeout(connect, jitter(base));
  }

  useEffect(() => {
    closedByUserRef.current = false;
    connect();
    return () => {
      closedByUserRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.token, opts.url]);

  const send = useCallback((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
