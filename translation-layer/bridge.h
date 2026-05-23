// translation-layer/bridge.h
//
// C++ translation bridge header — used by the native game engine (game-app/Native/).
// Mirrors ts-bridge.ts and Bridge.cs exactly.
//
// Dependencies:
//   HTTP: libcurl     — sudo apt install libcurl4-openssl-dev
//   (JSON handled manually; no external JSON lib required)
//
// Usage:
//   #include "../../translation-layer/bridge.h"
//   Celeste::CelesteBridge bridge("native-engine");
//   auto result = bridge.Login("alice", "secret");

#pragma once

#include <string>
#include <stdexcept>

namespace Celeste {

// ── Service URLs (mirrors SERVICE_URLS in ts-bridge.ts) ──────────────────────

struct Services {
    static constexpr const char* NodeServer  = "http://localhost:3000";
    static constexpr const char* ExpressApi  = "http://localhost:5000";
    static constexpr const char* GameServer  = "http://localhost:3001";
};

// ── Shared payload structs (mirror shared-contract.json → definitions) ────────

struct AuthRequest {
    std::string username;
    std::string password;
};

struct AuthResponse {
    std::string message;
    std::string username;
};

struct Position {
    double x = 0.0;
    double y = 0.0;
};

struct Player {
    std::string username;
    std::string registeredAt;
    int         score = 0;
    int         level = 1;
};

struct GameState {
    std::string playerId;
    int         level = 1;
    int         score = 0;
    int         lives = 3;
    Position    position;
    std::string timestamp;
};

struct HealthStatus {
    std::string status;   // "ok" | "error" | "degraded"
    std::string service;
    double      uptime = 0.0;
};

// ── Error type ────────────────────────────────────────────────────────────────

struct BridgeError : std::runtime_error {
    int code;
    explicit BridgeError(const std::string& msg, int c)
        : std::runtime_error(msg), code(c) {}
};

// ── BridgeMessage envelope (mirrors BridgeMessage<T> in ts-bridge.ts) ────────

struct BridgeMessage {
    std::string type;
    std::string source;
    std::string timestamp;
    std::string payloadJson;  // raw JSON of the payload field
};

// ── CelesteBridge ─────────────────────────────────────────────────────────────

class CelesteBridge {
public:
    explicit CelesteBridge(std::string source);
    ~CelesteBridge();

    // Wrap an AuthRequest into a BridgeMessage JSON string ready to POST
    std::string WrapAuthRequest(const std::string& type, const AuthRequest& payload) const;

    // Raw HTTP helpers
    std::string HttpPost(const std::string& url, const std::string& jsonBody) const;
    std::string HttpGet(const std::string& url) const;

    // High-level helpers (match Bridge.cs and ts-bridge.ts)
    AuthResponse  Register(const std::string& username, const std::string& password) const;
    AuthResponse  Login(const std::string& username, const std::string& password) const;
    HealthStatus  CheckHealth(const std::string& serviceBaseUrl) const;

    // JSON helpers (manual — no external dependency)
    static std::string     AuthRequestToJson(const AuthRequest& req);
    static AuthResponse    JsonToAuthResponse(const std::string& json);
    static HealthStatus    JsonToHealthStatus(const std::string& json);
    static std::string     CurrentTimestamp();

private:
    std::string _source;

    static std::string     EscapeJson(const std::string& s);
    static std::string     JsonField(const std::string& key, const std::string& val);
    static std::string     ExtractString(const std::string& json, const std::string& key);
};

} // namespace Celeste
