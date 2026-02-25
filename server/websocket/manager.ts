import type { WebSocket } from "ws";

type WebSocketEvent = "round:started" | "round:qr-updated" | "session:ended";

export interface SocketPayloadMap {
  "round:started": {
    sessionId: string;
    roundId: string;
    roundNumber: number;
    startsAt: string;
  };
  "round:qr-updated": {
    sessionId: string;
    roundId: string;
    token: string;
    expiresAt: string;
    qrPayload: string;
  };
  "session:ended": {
    sessionId: string;
    endedAt: string;
    summary: {
      totalRounds: number;
      attendanceCount: number;
    };
  };
}

const OPEN_STATE = 1;

class WebsocketManager {
  private channels = new Map<string, Set<WebSocket>>();

  register(sessionId: string, ws: WebSocket) {
    const channel = this.channels.get(sessionId) ?? new Set<WebSocket>();
    channel.add(ws);
    this.channels.set(sessionId, channel);
  }

  unregister(sessionId: string, ws: WebSocket) {
    const channel = this.channels.get(sessionId);
    if (!channel) {
      return;
    }

    channel.delete(ws);
    if (channel.size === 0) {
      this.channels.delete(sessionId);
    }
  }

  send<Event extends WebSocketEvent>(
    sessionId: string,
    event: Event,
    payload: SocketPayloadMap[Event],
  ) {
    const channel = this.channels.get(sessionId);
    if (!channel) {
      return;
    }

    const message = JSON.stringify({ event, payload });
    channel.forEach((socket) => {
      if (socket.readyState === OPEN_STATE) {
        socket.send(message);
      }
    });
  }
}

const websocketManager = new WebsocketManager();

export const emitRoundStarted = (
  sessionId: string,
  payload: SocketPayloadMap["round:started"],
) => {
  websocketManager.send(sessionId, "round:started", payload);
};

export const emitRoundQrUpdated = (
  sessionId: string,
  payload: SocketPayloadMap["round:qr-updated"],
) => {
  websocketManager.send(sessionId, "round:qr-updated", payload);
};

export const emitSessionEnded = (
  sessionId: string,
  payload: SocketPayloadMap["session:ended"],
) => {
  websocketManager.send(sessionId, "session:ended", payload);
};

export const registerSocket = (
  sessionId: string,
  wsSocket: WebSocket,
) => {
  websocketManager.register(sessionId, wsSocket);
};

export const unregisterSocket = (
  sessionId: string,
  wsSocket: WebSocket,
) => {
  websocketManager.unregister(sessionId, wsSocket);
};
