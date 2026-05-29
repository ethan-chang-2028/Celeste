import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./lib/logger";

type RaceSocket = WebSocket & {
  _name?: string;
  _roomId?: string | null;
  _namedCode?: string | null;
};

interface Room {
  id: string;
  seed: number;
  players: RaceSocket[];
}

interface NamedRoom {
  ws: RaceSocket;
  seed: number;
}

export function attachOnlineRace(server: Server): void {
  const wss = new WebSocketServer({ server });

  wss.on("error", (err) => {
    logger.error({ err }, "WebSocket server error");
  });

  const rooms = new Map<string, Room>();
  const waiting: RaceSocket[] = [];
  const namedRooms = new Map<string, NamedRoom>();

  let roomSeq = 0;
  const nextSeed = () => Math.floor(Math.random() * 999999);
  const nextRoomId = () => "r" + ++roomSeq;

  function makeRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++)
      code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function send(ws: RaceSocket, obj: unknown): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  }

  function matchPair(
    hostWs: RaceSocket,
    guestWs: RaceSocket,
    seed: number,
  ): void {
    const roomId = nextRoomId();
    rooms.set(roomId, { id: roomId, seed, players: [hostWs, guestWs] });
    hostWs._roomId = roomId;
    guestWs._roomId = roomId;
    send(hostWs, {
      type: "matched",
      roomId,
      seed,
      opponentName: guestWs._name,
    });
    send(guestWs, {
      type: "matched",
      roomId,
      seed,
      opponentName: hostWs._name,
    });
  }

  function cleanup(ws: RaceSocket): void {
    const qi = waiting.indexOf(ws);
    if (qi !== -1) waiting.splice(qi, 1);

    if (ws._namedCode) {
      namedRooms.delete(ws._namedCode);
      ws._namedCode = null;
    }

    if (ws._roomId) {
      const room = rooms.get(ws._roomId);
      if (room) {
        for (const p of room.players) {
          if (p !== ws) send(p, { type: "opponentLeft" });
        }
        rooms.delete(ws._roomId);
      }
      ws._roomId = null;
    }
  }

  wss.on("connection", (socket: WebSocket) => {
    const ws = socket as RaceSocket;
    ws._name = "Player";
    ws._roomId = null;
    ws._namedCode = null;

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg["type"] === "create") {
        ws._name = String(msg["name"] || "Player").substring(0, 20);
        let code: string;
        let attempts = 0;
        do {
          code = makeRoomCode();
        } while (namedRooms.has(code) && ++attempts < 20);
        namedRooms.set(code, { ws, seed: nextSeed() });
        ws._namedCode = code;
        send(ws, { type: "created", code });
      } else if (msg["type"] === "join") {
        ws._name = String(msg["name"] || "Player").substring(0, 20);
        const code = msg["code"]
          ? String(msg["code"]).toUpperCase().trim()
          : null;

        if (code) {
          const entry = namedRooms.get(code);
          if (!entry) {
            send(ws, {
              type: "error",
              message:
                'Room "' + code + '" not found. Check the code and try again.',
            });
            return;
          }
          if (entry.ws === ws) {
            send(ws, {
              type: "error",
              message: "You cannot join your own room.",
            });
            return;
          }
          namedRooms.delete(code);
          entry.ws._namedCode = null;
          matchPair(entry.ws, ws, entry.seed);
        } else {
          const peer = waiting.shift();
          if (peer) {
            matchPair(peer, ws, nextSeed());
          } else {
            waiting.push(ws);
            send(ws, { type: "waiting", roomId: null });
          }
        }
      } else if (msg["type"] === "state") {
        if (!ws._roomId) return;
        const room = rooms.get(ws._roomId);
        if (!room) return;
        for (const p of room.players) {
          if (p !== ws) {
            send(p, {
              type: "opponent",
              x: msg["x"],
              y: msg["y"],
              vx: msg["vx"],
              vy: msg["vy"],
              state: msg["state"],
              dashes: msg["dashes"],
              cp: msg["cp"],
              done: msg["done"],
              time: msg["time"],
            });
          }
        }
      } else if (msg["type"] === "leave") {
        cleanup(ws);
      }
    });

    ws.on("close", () => cleanup(ws));
    ws.on("error", () => cleanup(ws));
  });

  logger.info("Online race WebSocket server attached");
}
