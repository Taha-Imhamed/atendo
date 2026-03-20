import { useEffect, useEffectEvent } from "react";
import { buildWebSocketUrl } from "@/lib/queryClient";

type SessionSocketEvent =
  | {
      event: "round:qr-updated";
      payload: {
        sessionId: string;
        roundId: string;
        token: string;
        expiresAt: string;
        qrPayload: string;
      };
    }
  | {
      event: "round:started";
      payload: {
        sessionId: string;
        roundId: string;
        roundNumber: number;
        startsAt: string;
      };
    }
  | {
      event: "round:closed";
      payload: {
        sessionId: string;
        roundId: string;
        endedAt: string;
      };
    }
  | {
      event: "session:refresh";
      payload: {
        sessionId: string;
        reason: string;
        roundId?: string;
        studentId?: string;
        studentName?: string;
        status?: string;
        recordedAt?: string;
        excuseId?: string;
      };
    }
  | {
      event: "session:ended";
      payload: {
        sessionId: string;
        endedAt: string;
        summary: {
          totalRounds: number;
          attendanceCount: number;
        };
      };
    };

type Options = {
  enabled?: boolean;
  onMessage: (message: SessionSocketEvent) => void;
};

export function useSessionWebSocket(sessionId: string | undefined, options: Options) {
  const { enabled = true, onMessage } = options;
  const handleMessage = useEffectEvent(onMessage);

  useEffect(() => {
    if (!sessionId || !enabled) {
      return;
    }

    let closedByEffect = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(buildWebSocketUrl(sessionId));

      socket.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(event.data) as SessionSocketEvent);
        } catch (error) {
          console.error("ws message error", error);
        }
      };

      socket.onclose = () => {
        if (closedByEffect) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, 1000);
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [enabled, handleMessage, sessionId]);
}
