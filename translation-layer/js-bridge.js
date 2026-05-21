// translation-layer/js-bridge.js
//
// Browser-safe JavaScript translation bridge.
// Loaded by index.html via <script src="/js-bridge.js">.
// Mirrors ts-bridge.ts exactly — no build step required.
//
// Usage (browser):
//   const bridge = new CelesteBridge("browser");
//   const response = await bridge.login("alice", "secret");
//
// Usage (Node.js / CommonJS):
//   const { CelesteBridge } = require("./translation-layer/js-bridge");

"use strict";

const SERVICE_URLS = {
  "node-server": "http://localhost:3000",
  "express-api": "http://localhost:5000",
  "game-server": "http://localhost:3001",
};

class CelesteBridge {
  constructor(source) {
    this.source = source;
  }

  // ── Envelope helpers ────────────────────────────────────────────────────────

  wrap(type, payload) {
    return {
      type,
      source: this.source,
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  unwrap(message) {
    return message.payload;
  }

  // ── Core send ────────────────────────────────────────────────────────────────
  // Sends a BridgeMessage envelope.  The X-Bridge-Source header causes the
  // server to reply with a BridgeMessage envelope rather than a plain object.

  async send(target, endpoint, type, payload) {
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
      let message = `Server error (${response.status})`;
      try {
        const body = await response.json();
        message = body.payload?.message || body.message || message;
      } catch {}
      const err = new Error(message);
      err.code = response.status;
      throw err;
    }

    const envelope = await response.json();
    return this.unwrap(envelope);
  }

  // ── High-level helpers ──────────────────────────────────────────────────────

  async register(username, password) {
    return this.send("node-server", "/register", "auth.register", { username, password });
  }

  async login(username, password) {
    return this.send("node-server", "/login", "auth.login", { username, password });
  }

  async healthCheck(target) {
    const endpoint = target === "express-api" ? "/api/healthz" : "/healthz";
    const url = `${SERVICE_URLS[target]}${endpoint}`;

    const response = await fetch(url, {
      headers: { "X-Bridge-Source": this.source },
    });

    if (!response.ok) return { status: "error", service: target };
    return response.json();
  }

  // ── Serialization helpers ───────────────────────────────────────────────────

  serialize(message) {
    return JSON.stringify(message);
  }

  static deserialize(raw) {
    return JSON.parse(raw);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CelesteBridge, SERVICE_URLS };
}
if (typeof window !== "undefined") {
  window.CelesteBridge = CelesteBridge;
  window.CELESTE_SERVICE_URLS = SERVICE_URLS;
}
