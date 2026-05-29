// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// The "ws" package powers online 1v1 races. If it isn't installed we still
// want the game itself to load and be playable — only online race is disabled.
// (Previously a missing "ws" exited the whole process, so nothing served at
// all and the browser could never even reach the page, let alone connect.)
let WebSocketServer = null;
try {
    ({ WebSocketServer } = require('ws'));
} catch {
    // Not fatal: a built-in WebSocket fallback (below) keeps online race working.
    console.error('\nℹ️   Dependency "ws" not found — using the built-in WebSocket server instead.');
    console.error('    (Run "pnpm install" if you prefer the optimized "ws" implementation.)\n');
}

const PORT = process.env.PORT || 3000;
const DATA_FILE_PATH    = path.join(__dirname, 'game-app', 'Data', 'players.json');
const LEADERBOARD_PATH  = path.join(__dirname, 'game-app', 'Data', 'leaderboard.json');
const AI_MODEL_PATH      = path.join(__dirname, 'game-app', 'Data', 'ai-model.json');
const AI_RECORDING_PATH  = path.join(__dirname, 'game-app', 'Data', 'ai-recordings.json');
const BRIDGE_JS_PATH    = path.join(__dirname, 'translation-layer', 'js-bridge.js');

function isBridgeRequest(req) {
    return !!req.headers['x-bridge-source'];
}

function sendResponse(res, statusCode, type, payload, req) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    if (isBridgeRequest(req)) {
        return res.end(JSON.stringify({
            type,
            source: 'node-server',
            timestamp: new Date().toISOString(),
            payload,
        }));
    }
    return res.end(JSON.stringify(payload));
}

async function initDataFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
        let needsInit = false;
        try {
            const content = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            JSON.parse(content || 'null');
            if (!content.trim()) needsInit = true;
        } catch {
            needsInit = true;
        }
        if (needsInit) {
            await fs.writeFile(DATA_FILE_PATH, JSON.stringify([]));
        }
    } catch (error) {
        console.error("Could not initialize data file:", error);
    }
}
initDataFile();

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(e); }
        });
    });
}

async function readPlayers() {
    try {
        const fileData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(fileData);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Create the server
const server = http.createServer(async (req, res) => {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Source');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    try {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url === '/login' || req.url === '/login.html')) {
            const filePath = path.join(__dirname, 'game-app', 'webSite', 'index.html');
            const htmlContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(htmlContent);
        }

        const webSiteAssets = {
            '/app.js':        { file: 'app.js',        type: 'application/javascript' },
            '/register.js':   { file: 'register.js',   type: 'application/javascript' },
            '/ai-neural.js':  { file: 'ai-neural.js',  type: 'application/javascript' },
            '/style.css':     { file: 'style.css',     type: 'text/css' },
        };
        if (req.method === 'GET' && webSiteAssets[req.url]) {
            const { file, type } = webSiteAssets[req.url];
            const filePath = path.join(__dirname, 'game-app', 'webSite', file);
            const content = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': type });
            return res.end(content);
        }

        if (req.method === 'GET' && (req.url === '/register' || req.url === '/register.html')) {
            const filePath = path.join(__dirname, 'game-app', 'webSite', 'register.html');
            const htmlContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(htmlContent);
        }

        if (req.method === 'GET' && (req.url === '/profile' || req.url === '/profile.html')) {
            const filePath = path.join(__dirname, 'game-app', 'profile', 'profile.html');
            const htmlContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(htmlContent);
        }
        if (req.method === 'GET' && req.url === '/profile.js') {
            const filePath = path.join(__dirname, 'game-app', 'profile', 'profile.js');
            const jsContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            return res.end(jsContent);
        }

        if (req.method === 'GET' && req.url === '/js-bridge.js') {
            const jsContent = await fs.readFile(BRIDGE_JS_PATH, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            return res.end(jsContent);
        }

        const MIME = {
            '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        };
        if (req.method === 'GET' && (req.url === '/game' || req.url === '/game.html')) {
            const content = await fs.readFile(path.join(__dirname, 'game-app', 'webSite', 'game.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(content);
        }
        const isWasm = req.url.endsWith('.wasm') || req.url.endsWith('.wasm.wasm');
        const ext = path.extname(req.url);
        if (req.method === 'GET' && (MIME[ext] || isWasm)) {
            const fileName = path.basename(req.url);
            const filePath = path.join(__dirname, 'game-app', 'webSite', fileName);
            try {
                if (isWasm) {
                    const content = await fs.readFile(filePath);
                    res.writeHead(200, { 'Content-Type': 'application/wasm' });
                    return res.end(content);
                }
                const content = await fs.readFile(filePath, 'utf-8');
                res.writeHead(200, { 'Content-Type': MIME[ext] });
                return res.end(content);
            } catch { /* fall through to 404 */ }
        }

        if (req.method === 'POST' && req.url === '/register') {
            const data = await getRequestBody(req);
            const isBridge = isBridgeRequest(req);
            const payload = isBridge ? data.payload : data;
            const { username, email, password, country = '', avatar = 'Madeline' } = payload;

            if (!username || !email || !password) {
                return sendResponse(res, 400, 'auth.response',
                    { message: "Username, email, and password are required." }, req);
            }

            const players = await readPlayers();
            if (players.find(p => p.username === username)) {
                return sendResponse(res, 400, 'auth.response',
                    { message: "Username is already taken!" }, req);
            }
            if (players.find(p => p.email === email)) {
                return sendResponse(res, 400, 'auth.response',
                    { message: "An account with that email already exists." }, req);
            }

            const newUser = {
                id: 'u-' + Math.random().toString(36).slice(2, 8),
                username, email, password, country, avatar,
                role: 'player', bio: '',
                deathCount: 0, bestTimes: {}, levelsCompleted: 0,
                achievements: [], rank: null,
                registeredAt: new Date().toISOString(), lastLogin: null
            };
            players.push(newUser);
            await fs.writeFile(DATA_FILE_PATH, JSON.stringify(players, null, 2));
            return sendResponse(res, 201, 'auth.response',
                { message: "Account created successfully!" }, req);
        }

        if (req.method === 'POST' && req.url === '/login') {
            const data = await getRequestBody(req);
            const isBridge = isBridgeRequest(req);
            const payload = isBridge ? data.payload : data;
            const { username, password } = payload;

            const players = await readPlayers();
            const validUser = players.find(
                p => (p.username === username || p.email === username) && p.password === password
            );

            if (validUser) {
                validUser.lastLogin = new Date().toISOString();
                await fs.writeFile(DATA_FILE_PATH, JSON.stringify(players, null, 2));
                const { password: _pw, ...safeUser } = validUser;
                return sendResponse(res, 200, 'auth.response',
                    { message: "Login successful!", user: safeUser }, req);
            } else {
                return sendResponse(res, 401, 'auth.response',
                    { message: "Invalid username or password." }, req);
            }
        }

        if (req.method === 'GET' && req.url === '/ai-model') {
            try {
                const data = await fs.readFile(AI_MODEL_PATH, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(data);
            } catch {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ weights: null }));
            }
        }

        if (req.method === 'POST' && req.url === '/ai-model') {
            const data = await getRequestBody(req);
            if (data && Array.isArray(data.weights) && data.weights.length > 0) {
                let currentBestFit = -Infinity;
                try {
                    const existing = await fs.readFile(AI_MODEL_PATH, 'utf-8');
                    const parsed = JSON.parse(existing);
                    if (typeof parsed.bestFit === 'number') currentBestFit = parsed.bestFit;
                } catch { /* no existing model */ }
                const incomingFit = typeof data.bestFit === 'number' ? data.bestFit : 0;
                if (incomingFit > currentBestFit) {
                    await fs.mkdir(path.dirname(AI_MODEL_PATH), { recursive: true });
                    await fs.writeFile(AI_MODEL_PATH, JSON.stringify(data, null, 2));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ message: 'AI model saved.', accepted: true }));
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Existing model is better, not overwritten.', accepted: false }));
        }

        if (req.method === 'GET' && req.url === '/ai-recording') {
            try {
                const data = await fs.readFile(AI_RECORDING_PATH, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(data);
            } catch {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify([]));
            }
        }

        if (req.method === 'POST' && req.url === '/ai-recording') {
            const session = await getRequestBody(req);
            if (!session || !Array.isArray(session.frames) || session.frames.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: 'No frames in recording.' }));
            }
            let recordings = [];
            try {
                const existing = await fs.readFile(AI_RECORDING_PATH, 'utf-8');
                recordings = JSON.parse(existing);
                if (!Array.isArray(recordings)) recordings = [];
            } catch { /* start fresh */ }
            recordings.push({
                seed: session.seed || 0,
                recordedAt: new Date().toISOString(),
                frames: session.frames,
            });
            await fs.mkdir(path.dirname(AI_RECORDING_PATH), { recursive: true });
            await fs.writeFile(AI_RECORDING_PATH, JSON.stringify(recordings));
            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Recording saved.', frames: session.frames.length }));
        }

        if (req.method === 'GET' && req.url === '/leaderboard') {
            try {
                const data = await fs.readFile(LEADERBOARD_PATH, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(data);
            } catch {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify([]));
            }
        }

        if (req.method === 'POST' && req.url === '/leaderboard') {
            const entry = await getRequestBody(req);
            let records = [];
            try {
                const existing = await fs.readFile(LEADERBOARD_PATH, 'utf-8');
                records = JSON.parse(existing);
                if (!Array.isArray(records)) records = [];
            } catch { /* start fresh */ }
            records.push({ ...entry, savedAt: new Date().toISOString() });
            await fs.mkdir(path.dirname(LEADERBOARD_PATH), { recursive: true });
            await fs.writeFile(LEADERBOARD_PATH, JSON.stringify(records, null, 2));
            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Run saved.' }));
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');

    } catch (error) {
        console.error('Server error:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// ── Online race: WebSocket room-code matchmaking + state relay ────────────────
//
// Protocol (all messages are JSON strings):
//
//   Client -> Server:
//     { type:'create', name:'Alice' }              <- host creates a named room
//     { type:'join',   name:'Bob', code:'ABC123' } <- guest joins by code
//     { type:'join',   name:'Bob' }                <- random matchmaking (no code)
//     { type:'state',  x, y, vx, vy, state, dashes, cp, done, time }
//     { type:'leave' }
//
//   Server -> Client:
//     { type:'created',     code:'ABC123' }         <- room ready; share with friend
//     { type:'waiting',     roomId }                <- in random queue
//     { type:'matched',     roomId, seed, opponentName }
//     { type:'opponent',    x, y, vx, vy, state, dashes, cp, done, time }
//     { type:'opponentLeft' }
//     { type:'error',       message }

const wss = WebSocketServer ? new WebSocketServer({ server }) : null;

// Prevent unhandled-error crashes: the ws library re-emits HTTP server errors
// onto the WebSocketServer; without these handlers Node.js would throw and exit.
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Port ${PORT} is already in use — is the server already running?\n`);
    } else {
        console.error('HTTP server error:', err);
    }
    process.exit(1);
});
if (wss) wss.on('error', (err) => {
    console.error('WebSocket server error:', err);
});

// Active rooms: roomId -> { id, seed, players:[ws, ws] }
const rooms      = new Map();
// Random-match queue
const waiting    = [];
// Named rooms waiting for a joiner: code -> { ws, seed }
const namedRooms = new Map();

let _roomSeq = 0;
function nextSeed()   { return Math.floor(Math.random() * 999999); }
function nextRoomId() { return 'r' + (++_roomSeq); }

function makeRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function matchPair(hostWs, guestWs, seed) {
    const roomId = nextRoomId();
    rooms.set(roomId, { id: roomId, seed, players: [hostWs, guestWs] });
    hostWs._roomId  = roomId;
    guestWs._roomId = roomId;
    send(hostWs,  { type: 'matched', roomId, seed, opponentName: guestWs._name });
    send(guestWs, { type: 'matched', roomId, seed, opponentName: hostWs._name  });
}

function cleanup(ws) {
    // Remove from random-match queue
    const qi = waiting.indexOf(ws);
    if (qi !== -1) waiting.splice(qi, 1);

    // Remove named room if this socket was the host waiting for a joiner
    if (ws._namedCode) {
        namedRooms.delete(ws._namedCode);
        ws._namedCode = null;
    }

    // Remove from active room and notify partner
    if (ws._roomId) {
        const room = rooms.get(ws._roomId);
        if (room) {
            for (const p of room.players) {
                if (p !== ws) send(p, { type: 'opponentLeft' });
            }
            rooms.delete(ws._roomId);
        }
        ws._roomId = null;
    }
}

if (wss) wss.on('connection', onConnection);

function onConnection(ws) {
    ws._name      = 'Player';
    ws._roomId    = null;
    ws._namedCode = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // ── Create a named room (host waits for a friend's join) ──────────────
        if (msg.type === 'create') {
            ws._name = (msg.name || 'Player').substring(0, 20);
            let code, attempts = 0;
            do { code = makeRoomCode(); } while (namedRooms.has(code) && ++attempts < 20);
            namedRooms.set(code, { ws, seed: nextSeed() });
            ws._namedCode = code;
            send(ws, { type: 'created', code });

        // ── Join by room code or random queue ─────────────────────────────────
        } else if (msg.type === 'join') {
            ws._name = (msg.name || 'Player').substring(0, 20);
            const code = msg.code ? msg.code.toUpperCase().trim() : null;

            if (code) {
                const entry = namedRooms.get(code);
                if (!entry) {
                    send(ws, { type: 'error', message: 'Room "' + code + '" not found. Check the code and try again.' });
                    return;
                }
                if (entry.ws === ws) {
                    send(ws, { type: 'error', message: 'You cannot join your own room.' });
                    return;
                }
                namedRooms.delete(code);
                entry.ws._namedCode = null;
                matchPair(entry.ws, ws, entry.seed);
            } else {
                if (waiting.length > 0) {
                    matchPair(waiting.shift(), ws, nextSeed());
                } else {
                    waiting.push(ws);
                    send(ws, { type: 'waiting', roomId: null });
                }
            }

        // ── Relay state to room partner ───────────────────────────────────────
        } else if (msg.type === 'state') {
            if (!ws._roomId) return;
            const room = rooms.get(ws._roomId);
            if (!room) return;
            for (const p of room.players) {
                if (p !== ws) {
                    send(p, {
                        type:   'opponent',
                        x:      msg.x,  y:     msg.y,
                        vx:     msg.vx, vy:    msg.vy,
                        state:  msg.state,
                        dashes: msg.dashes,
                        cp:     msg.cp,
                        done:   msg.done,
                        time:   msg.time,
                    });
                }
            }

        } else if (msg.type === 'leave') {
            cleanup(ws);
        }
    });

    ws.on('close', () => cleanup(ws));
    ws.on('error', () => cleanup(ws));
}

// ── Built-in WebSocket fallback ───────────────────────────────────────────────
// If the "ws" package isn't installed, online race would be dead. To keep
// multiplayer working with zero external dependencies, implement the small
// slice of RFC 6455 this app needs (text frames, masking, ping/close) using
// only Node's built-in http + crypto. Messages here are tiny JSON strings.
if (!wss) {
    const crypto = require('crypto');
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

    function encodeFrame(payload, opcode = 0x1) {
        const len = payload.length;
        let header;
        if (len < 126) {
            header = Buffer.from([0x80 | opcode, len]);
        } else if (len < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x80 | opcode; header[1] = 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x80 | opcode; header[1] = 127;
            header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
            header.writeUInt32BE(len >>> 0, 6);
        }
        return Buffer.concat([header, payload]);
    }

    function parseFrame(buf) {
        if (buf.length < 2) return null;
        const fin = (buf[0] & 0x80) !== 0;
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
            if (buf.length < 4) return null;
            len = buf.readUInt16BE(2); offset = 4;
        } else if (len === 127) {
            if (buf.length < 10) return null;
            len = buf.readUInt32BE(2) * 2 ** 32 + buf.readUInt32BE(6); offset = 10;
        }
        let mask = null;
        if (masked) {
            if (buf.length < offset + 4) return null;
            mask = buf.slice(offset, offset + 4); offset += 4;
        }
        if (buf.length < offset + len) return null;
        let payload = Buffer.from(buf.slice(offset, offset + len));
        if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        return { fin, opcode, payload, totalLen: offset + len };
    }

    server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
        );

        // Minimal ws-compatible connection object (send / on / readyState).
        const conn = new (require('events').EventEmitter)();
        conn.OPEN = 1;
        conn.readyState = 1;
        conn.send = (str) => {
            if (conn.readyState !== 1) return;
            try { socket.write(encodeFrame(Buffer.from(String(str), 'utf8'))); } catch { /* socket gone */ }
        };
        conn.close = () => { conn.readyState = 3; try { socket.end(); } catch {} };

        let buf = Buffer.alloc(0);
        let fragOpcode = 0, fragParts = [];
        socket.on('data', (d) => {
            buf = Buffer.concat([buf, d]);
            let frame;
            while ((frame = parseFrame(buf))) {
                buf = buf.slice(frame.totalLen);
                if (frame.opcode === 0x8) { conn.close(); conn.emit('close'); return; }
                if (frame.opcode === 0x9) { try { socket.write(encodeFrame(frame.payload, 0xA)); } catch {} continue; }
                if (frame.opcode === 0xA) continue;  // pong
                if (frame.opcode === 0x0) fragParts.push(frame.payload);
                else { fragOpcode = frame.opcode; fragParts = [frame.payload]; }
                if (frame.fin) {
                    const full = Buffer.concat(fragParts);
                    fragParts = [];
                    if (fragOpcode === 0x1 || fragOpcode === 0x2) conn.emit('message', full.toString('utf8'));
                }
            }
        });
        socket.on('close', () => { conn.readyState = 3; conn.emit('close'); });
        socket.on('error', () => { conn.readyState = 3; conn.emit('error'); });

        onConnection(conn);
    });

    console.log('🌐  Online race: using built-in WebSocket server (no "ws" package needed)');
}

// Start the server
server.listen(PORT, () => {
    console.log(`\n✅  Server running — open http://localhost:${PORT} in your browser`);
    console.log(`🌐  Online race: ENABLED via ${wss ? 'the "ws" package' : 'the built-in WebSocket server'}\n`);
});
