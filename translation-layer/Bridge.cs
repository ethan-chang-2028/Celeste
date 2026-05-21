// translation-layer/Bridge.cs
//
// C# translation bridge — used by the ASP.NET Core game server (game-app/).
// Mirrors ts-bridge.ts exactly using C# records + System.Text.Json.
//
// Usage:
//   var bridge = new CelesteBridge("game-server");
//   AuthResponse result = await bridge.Login("alice", "secret");
//
// Register as a singleton in Program.cs:
//   builder.Services.AddSingleton<CelesteBridge>(
//       new CelesteBridge("game-server"));

using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Celeste.TranslationLayer;

// ── Shared envelope (mirrors BridgeMessage<T> in ts-bridge.ts) ───────────────

public record BridgeMessage<TPayload>(
    [property: JsonPropertyName("type")]      string Type,
    [property: JsonPropertyName("source")]    string Source,
    [property: JsonPropertyName("timestamp")] string Timestamp,
    [property: JsonPropertyName("payload")]   TPayload Payload
);

// ── Shared payload types (mirror shared-contract.json → definitions) ──────────

public record AuthRequest(
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("password")] string Password
);

public record AuthResponse(
    [property: JsonPropertyName("message")]  string Message,
    [property: JsonPropertyName("username")] string? Username = null
);

public record Player(
    [property: JsonPropertyName("username")]     string Username,
    [property: JsonPropertyName("registeredAt")] string? RegisteredAt = null,
    [property: JsonPropertyName("score")]        int Score = 0,
    [property: JsonPropertyName("level")]        int Level = 1
);

public record Position(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y
);

public record GameState(
    [property: JsonPropertyName("playerId")]  string PlayerId,
    [property: JsonPropertyName("level")]     int Level,
    [property: JsonPropertyName("score")]     int Score,
    [property: JsonPropertyName("lives")]     int Lives,
    [property: JsonPropertyName("timestamp")] string Timestamp,
    [property: JsonPropertyName("position")]  Position? Position = null
);

public record HealthStatus(
    [property: JsonPropertyName("status")]  string Status,
    [property: JsonPropertyName("service")] string? Service = null,
    [property: JsonPropertyName("uptime")]  double? Uptime = null
);

public record ApiError(
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("code")]    int Code
);

// ── Service registry (mirrors SERVICE_URLS in ts-bridge.ts) ─────────────────

public static class Services
{
    public const string NodeServer  = "http://localhost:3000";
    public const string ExpressApi  = "http://localhost:5000";
    public const string GameServer  = "http://localhost:3001";
}

// ── CelesteBridge ─────────────────────────────────────────────────────────────

public class CelesteBridge : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _source;
    private bool _disposed;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy   = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public CelesteBridge(string source, HttpClient? httpClient = null)
    {
        _source = source;
        _http   = httpClient ?? new HttpClient();
    }

    // ── Envelope helpers ──────────────────────────────────────────────────────

    public BridgeMessage<TPayload> Wrap<TPayload>(string type, TPayload payload) =>
        new(type, _source, DateTime.UtcNow.ToString("o"), payload);

    public TPayload Unwrap<TPayload>(BridgeMessage<TPayload> message) =>
        message.Payload;

    // ── Core send ─────────────────────────────────────────────────────────────

    public async Task<TResponse> Send<TPayload, TResponse>(
        string baseUrl,
        string endpoint,
        string type,
        TPayload payload,
        CancellationToken ct = default)
    {
        var envelope = Wrap(type, payload);
        var request  = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}{endpoint}")
        {
            Content = JsonContent.Create(envelope, options: JsonOpts)
        };
        request.Headers.Add("X-Bridge-Source", _source);

        var response = await _http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content
            .ReadFromJsonAsync<BridgeMessage<TResponse>>(JsonOpts, ct);
        return Unwrap(result!);
    }

    // ── High-level helpers ────────────────────────────────────────────────────

    public Task<AuthResponse> Register(string username, string password, CancellationToken ct = default) =>
        Send<AuthRequest, AuthResponse>(
            Services.NodeServer, "/register", "auth.register",
            new AuthRequest(username, password), ct);

    public Task<AuthResponse> Login(string username, string password, CancellationToken ct = default) =>
        Send<AuthRequest, AuthResponse>(
            Services.NodeServer, "/login", "auth.login",
            new AuthRequest(username, password), ct);

    public async Task<HealthStatus> HealthCheck(string serviceBaseUrl, CancellationToken ct = default)
    {
        var endpoint = serviceBaseUrl == Services.ExpressApi ? "/api/healthz" : "/healthz";
        var request  = new HttpRequestMessage(HttpMethod.Get, $"{serviceBaseUrl}{endpoint}");
        request.Headers.Add("X-Bridge-Source", _source);

        var response = await _http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            return new HealthStatus("error", serviceBaseUrl);

        return (await response.Content.ReadFromJsonAsync<HealthStatus>(JsonOpts, ct))!;
    }

    // ── Serialization helpers ─────────────────────────────────────────────────

    public string Serialize<T>(BridgeMessage<T> message) =>
        JsonSerializer.Serialize(message, JsonOpts);

    public static BridgeMessage<T>? Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<BridgeMessage<T>>(json, JsonOpts);

    public void Dispose()
    {
        if (_disposed) return;
        _http.Dispose();
        _disposed = true;
    }
}
