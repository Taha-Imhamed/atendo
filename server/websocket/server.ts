import { type IncomingMessage, type Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { sessionMiddleware } from "../middleware/session";
import {
  registerSocket,
  unregisterSocket,
} from "./manager";
import { userRepository } from "../repositories/userRepository";
import { db } from "../db";
import { sessions } from "@shared/schema";
import { eq } from "drizzle-orm";

function parseSessionId(req: IncomingMessage) {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "", `http://${host}`);
    return url.searchParams.get("sessionId") ?? undefined;
  } catch {
    return undefined;
  }
}

export function setupWebSocketServer(httpServer: HttpServer, viteWss?: any) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const upgradePath = req.url ?? "";
    // Let Vite handle its own HMR WebSocket upgrades
    if (upgradePath.startsWith("/vite-hmr")) {
      // Don't handle here - Vite middleware handles this
      return;
    }

    sessionMiddleware(req as any, {} as any, () => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const sessionId = parseSessionId(req);
    const session = (req as any).session;
    const userId = session?.passport?.user as string | undefined;

    if (!sessionId || !userId) {
      ws.close(1008, "Invalid session");
      return;
    }

    const user = await userRepository.findById(userId);
    if (!user || user.role !== "professor") {
      ws.close(1008, "Unauthorized");
      return;
    }

    const [sessionRecord] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRecord || sessionRecord.professor_id !== userId) {
      ws.close(1008, "Invalid session");
      return;
    }

    registerSocket(sessionId, ws);
    ws.once("close", () => {
      unregisterSocket(sessionId, ws);
    });
  });
}
