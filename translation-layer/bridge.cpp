// translation-layer/bridge.cpp
//
// C++ CelesteBridge implementation.
// Compile with: g++ -std=c++17 bridge.cpp -lcurl -o bridge_test
//
// Mirrors the TypeScript and C# bridges exactly — same service URLs,
// same BridgeMessage envelope, same X-Bridge-Source header.

#include "bridge.h"
#include <curl/curl.h>
#include <ctime>
#include <sstream>
#include <stdexcept>

namespace Celeste {

// ── libcurl write callback ────────────────────────────────────────────────────

static size_t WriteCallback(char* ptr, size_t size, size_t nmemb, std::string* out)
{
    out->append(ptr, size * nmemb);
    return size * nmemb;
}

// ── Constructor / Destructor ──────────────────────────────────────────────────

CelesteBridge::CelesteBridge(std::string source) : _source(std::move(source))
{
    curl_global_init(CURL_GLOBAL_DEFAULT);
}

CelesteBridge::~CelesteBridge()
{
    curl_global_cleanup();
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

std::string CelesteBridge::CurrentTimestamp()
{
    time_t now = time(nullptr);
    char   buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", gmtime(&now));
    return buf;
}

// ── JSON helpers (manual — no external library) ───────────────────────────────

std::string CelesteBridge::EscapeJson(const std::string& s)
{
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
        }
    }
    return out;
}

std::string CelesteBridge::JsonField(const std::string& key, const std::string& val)
{
    return "\"" + key + "\":\"" + EscapeJson(val) + "\"";
}

std::string CelesteBridge::ExtractString(const std::string& json, const std::string& key)
{
    const std::string search = "\"" + key + "\":\"";
    auto pos = json.find(search);
    if (pos == std::string::npos) return "";
    pos += search.size();
    const auto end = json.find('"', pos);
    if (end == std::string::npos) return "";
    return json.substr(pos, end - pos);
}

// ── Serialization ─────────────────────────────────────────────────────────────

std::string CelesteBridge::AuthRequestToJson(const AuthRequest& req)
{
    return "{"
        + JsonField("username", req.username) + ","
        + JsonField("password", req.password)
        + "}";
}

std::string CelesteBridge::WrapAuthRequest(const std::string& type, const AuthRequest& payload) const
{
    return "{"
        + JsonField("type",      type)
        + "," + JsonField("source",    _source)
        + "," + JsonField("timestamp", CurrentTimestamp())
        + ",\"payload\":" + AuthRequestToJson(payload)
        + "}";
}

AuthResponse CelesteBridge::JsonToAuthResponse(const std::string& json)
{
    AuthResponse r;
    // Responses may arrive as BridgeMessage envelope or plain object.
    // Detect by presence of "payload" key.
    const auto payloadPos = json.find("\"payload\":{");
    if (payloadPos != std::string::npos) {
        const auto inner = json.substr(payloadPos + 10);
        r.message  = ExtractString(inner, "message");
        r.username = ExtractString(inner, "username");
    } else {
        r.message  = ExtractString(json, "message");
        r.username = ExtractString(json, "username");
    }
    return r;
}

HealthStatus CelesteBridge::JsonToHealthStatus(const std::string& json)
{
    HealthStatus h;
    h.status  = ExtractString(json, "status");
    h.service = ExtractString(json, "service");
    return h;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

std::string CelesteBridge::HttpPost(const std::string& url, const std::string& jsonBody) const
{
    CURL* curl = curl_easy_init();
    if (!curl) throw std::runtime_error("curl_easy_init failed");

    std::string response;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    const std::string hdr = "X-Bridge-Source: " + _source;
    headers = curl_slist_append(headers, hdr.c_str());

    curl_easy_setopt(curl, CURLOPT_URL,           url.c_str());
    curl_easy_setopt(curl, CURLOPT_POST,           1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS,     jsonBody.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER,     headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION,  WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA,      &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT,        10L);

    CURLcode res  = curl_easy_perform(curl);
    long httpCode = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK)
        throw std::runtime_error(std::string("curl: ") + curl_easy_strerror(res));
    if (httpCode >= 400)
        throw BridgeError("HTTP " + std::to_string(httpCode) + ": " + response,
                          static_cast<int>(httpCode));
    return response;
}

std::string CelesteBridge::HttpGet(const std::string& url) const
{
    CURL* curl = curl_easy_init();
    if (!curl) throw std::runtime_error("curl_easy_init failed");

    std::string response;
    const std::string hdr = "X-Bridge-Source: " + _source;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, hdr.c_str());

    curl_easy_setopt(curl, CURLOPT_URL,           url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPGET,        1L);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER,     headers);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION,  WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA,      &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT,        10L);

    CURLcode res  = curl_easy_perform(curl);
    long httpCode = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &httpCode);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK)
        throw std::runtime_error(std::string("curl: ") + curl_easy_strerror(res));
    if (httpCode >= 400)
        return "{\"status\":\"error\"}";
    return response;
}

// ── High-level helpers ────────────────────────────────────────────────────────

AuthResponse CelesteBridge::Register(const std::string& username, const std::string& password) const
{
    const auto body = WrapAuthRequest("auth.register", {username, password});
    const auto raw  = HttpPost(std::string(Services::NodeServer) + "/register", body);
    return JsonToAuthResponse(raw);
}

AuthResponse CelesteBridge::Login(const std::string& username, const std::string& password) const
{
    const auto body = WrapAuthRequest("auth.login", {username, password});
    const auto raw  = HttpPost(std::string(Services::NodeServer) + "/login", body);
    return JsonToAuthResponse(raw);
}

HealthStatus CelesteBridge::CheckHealth(const std::string& serviceBaseUrl) const
{
    const std::string endpoint =
        (serviceBaseUrl == Services::ExpressApi) ? "/api/healthz" : "/healthz";
    const auto raw = HttpGet(serviceBaseUrl + endpoint);
    return JsonToHealthStatus(raw);
}

} // namespace Celeste
