// translation-layer/ts-bridge.ts
//
// TypeScript translation bridge — used by the Express API server (artifacts/api-server)
// and any TypeScript module that needs to speak to another Celeste service.
//
// All types mirror shared-contract.json exactly.
// Browser code: use js-bridge.js instead (no TypeScript required).

// ── Shared types (mirror shared-contract.json) ────────────────────────────────

export interface BridgeMessage<TPayload = unknown> {
  type: string;
  source: ServiceName;
  timestamp: string;
  payload: TPayload;
}

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  username?: string;
}

export interface Player {
  username: string;
  registeredAt?: string;
  score?: number;
  level?: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface GameState {
  playerId: string;
  level: number;
  score: number;
  lives: number;
  position?: Position;
  timestamp: string;
}

export interface HealthStatus {
  status: "ok" | "error" | "degraded";
  service?: string;
  uptime?: number;
}

export interface ApiError {
  message: string;
  code: number;
}

// ── Service registry (mirrors shared-contract.json → services) ────────────────

export type ServiceName =
  | "node-server"
  | "express-api"
  | "game-server"
  | "native-engine"
  | "browser";

export type MessageType =
  | "auth.register"
  | "auth.login"
  | "auth.response"
  | "game.state"
  | "game.update"
  | "health.check"
  | "health.response"
  | "error";

export const SERVICE_URLS = {
  "node-server": "http://localhost:3000",
  "express-api": "http://localhost:5000",
  "game-server": "http://localhost:3001",
} as const satisfies Record<string, string>;

type RemoteService = keyof typeof SERVICE_URLS;

// ── CelesteBridge ─────────────────────────────────────────────────────────────

export class CelesteBridge {
  private readonly source: ServiceName;

  constructor(source: ServiceName) {
    this.source = source;
  }

  /** Wrap any payload in the standard envelope. */
  wrap<TPayload>(type: MessageType, payload: TPayload): BridgeMessage<TPayload> {
    return {
      type,
      source: this.source,
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  /** Extract the payload from a bridge envelope. */
  unwrap<TPayload>(message: BridgeMessage<TPayload>): TPayload {
    return message.payload;
  }

  /**
   * Send a BridgeMessage to another service and return the unwrapped response.
   * The X-Bridge-Source header tells the receiving server to reply in bridge format.
   */
  async send<TPayload, TResponse>(
    target: RemoteService,
    endpoint: string,
    type: MessageType,
    payload: TPayload,
  ): Promise<TResponse> {
    const url = `${SERVICE_URLS[target]}${endpoint}`;
    const message = this.wrap(type, payload);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Source": this.source,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const err: ApiError = { message: `HTTP ${response.status}`, code: response.status };
      throw err;
    }

    const raw = (await response.json()) as BridgeMessage<TResponse>;
    return this.unwrap(raw);
  }

  // ── High-level helpers ──────────────────────────────────────────────────────

  async register(username: string, password: string): Promise<AuthResponse> {
    return this.send<AuthRequest, AuthResponse>(
      "node-server", "/register", "auth.register", { username, password },
    );
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.send<AuthRequest, AuthResponse>(
      "node-server", "/login", "auth.login", { username, password },
    );
  }

  async healthCheck(target: RemoteService): Promise<HealthStatus> {
    const endpoint = target === "express-api" ? "/api/healthz" : "/healthz";
    const url = `${SERVICE_URLS[target]}${endpoint}`;

    const response = await fetch(url, {
      headers: { "X-Bridge-Source": this.source },
    });

    if (!response.ok) return { status: "error", service: target };
    return (await response.json()) as HealthStatus;
  }

  // ── Serialization helpers ───────────────────────────────────────────────────

  serialize<T>(message: BridgeMessage<T>): string {
    return JSON.stringify(message);
  }

  static deserialize<T>(raw: string): BridgeMessage<T> {
    return JSON.parse(raw) as BridgeMessage<T>;
  }
}
