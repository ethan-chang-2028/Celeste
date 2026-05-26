// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;
const DATA_FILE_PATH    = path.join(__dirname, 'game-app', 'Data', 'players.json');
const LEADERBOARD_PATH  = path.join(__dirname, 'game-app', 'Data', 'leaderboard.json');
const AI_MODEL_PATH     = path.join(__dirname, 'game-app', 'Data', 'ai-model.json');
const BRIDGE_JS_PATH    = path.join(__dirname, 'translation-layer', 'js-bridge.js');

// Detect whether the request came from a CelesteBridge client.
// If so, wrap every response in the shared BridgeMessage envelope.
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

// --- Helper: Ensure the players.json file exists and is valid on startup ---
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

// --- Helper: Read incoming JSON data from the browser ---
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
}

// --- Helper: Safely read and parse players array from disk ---
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

    // 1. Handle CORS (Allows browser to talk to server smoothly)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Source');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    try {
        // 2. Serve the HTML file (login page)
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url === '/login' || req.url === '/login.html')) {
            const filePath = path.join(__dirname, 'game-app', 'webSite', 'index.html');
            const htmlContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(htmlContent);
        }

        // 3. Serve static assets from webSite folder
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

        // 3a. Serve register page
        if (req.method === 'GET' && (req.url === '/register' || req.url === '/register.html')) {
            const filePath = path.join(__dirname, 'game-app', 'webSite', 'register.html');
            const htmlContent = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(htmlContent);
        }

        // 3b. Serve profile page and its script
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

        // 3b. Serve the translation bridge for the browser
        if (req.method === 'GET' && req.url === '/js-bridge.js') {
            const jsContent = await fs.readFile(BRIDGE_JS_PATH, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            return res.end(jsContent);
        }

        // 3c. Serve game page by name, then serve any file from webSite/ dynamically
        const MIME = {
            '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        };
        if (req.method === 'GET' && (req.url === '/game' || req.url === '/game.html')) {
            const content = await fs.readFile(path.join(__dirname, 'game-app', 'webSite', 'game.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(content);
        }
        // Serve any .js/.css/.wasm file directly from webSite/ â avoids manual allowlist
        // Note: Emscripten outputs <name>.wasm.wasm so we match on url ending, not just ext
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

        // 4. Handle Registration POST Request
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
                username,
                email,
                password,
                country,
                avatar,
                role: 'player',
                bio: '',
                deathCount: 0,
                bestTimes: {},
                levelsCompleted: 0,
                achievements: [],
                rank: null,
                registeredAt: new Date().toISOString(),
                lastLogin: null
            };
            players.push(newUser);
            await fs.writeFile(DATA_FILE_PATH, JSON.stringify(players, null, 2));

            return sendResponse(res, 201, 'auth.response',
                { message: "Account created successfully!" }, req);
        }

        // 5. Handle Login POST Request
        if (req.method === 'POST' && req.url === '/login') {
            const data = await getRequestBody(req);
            const isBridge = isBridgeRequest(req);

            const payload = isBridge ? data.payload : data;
            const { username, password } = payload;

            const players = await readPlayers();

            // Match by username or email
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

        // 6. AI model weights â GET loads, POST saves
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
            // Only save if incoming weights are strictly better than what's on disk.
            // This prevents a fresh browser session from overwriting a well-trained model.
            if (data && Array.isArray(data.weights) && data.weights.length > 0) {
                let currentBestFit = -Infinity;
                try {
                    const existing = await fs.readFile(AI_MODEL_PATH, 'utf-8');
                    const parsed = JSON.parse(existing);
                    if (typeof parsed.bestFit === 'number') currentBestFit = parsed.bestFit;
                } catch { /* no existing model â accept anything */ }

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

        // 7. Leaderboard â GET loads, POST appends a run record
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
            } catch { /* file missing or corrupt â start fresh */ }
            records.push({ ...entry, savedAt: new Date().toISOString() });
            await fs.mkdir(path.dirname(LEADERBOARD_PATH), { recursive: true });
            await fs.writeFile(LEADERBOARD_PATH, JSON.stringify(records, null, 2));
            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Run saved.' }));
        }

        // 8. Catch-all for files or routes not found
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');

    } catch (error) {
        // If something crashes, send a 500 error
        console.error('Server error:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
});

// ââ Online race: WebSocket matchmaking + state relay âââââââââââââââââââââââââ
//
// Protocol (all messages are JSON strings):
//
//   Client â Server:
//     { type:'join',    name:'Alice' }
//     { type:'state',   x, y, vx, vy, state, dashes, cp, done, time }
//     { type:'leave' }
//
//   Server â Client:
//     { type:'waiting',  roomId }            â in queue, waiting for opponent
//     { type:'matched',  roomId, seed, opponentName }  â race starts
//     { type:'opponent', x, y, vx, vy, state, dashes, cp, done, time }
//     { type:'opponentLeft' }

const wss = new WebSocketServer({ server });

// Each lobby room: { id, seed, players: [ws, ws] }
const rooms   = new Map();   // roomId â room
const waiting = [];          // queue of solo ws sockets

let _roomSeq = 0;
function nextSeed() { return Math.floor(Math.random() * 999999); }
function nextRoomId() { return 'r' + (++_roomSeq); }

function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function cleanup(ws) {
    // Remove from waiting queue
    const qi = waiting.indexOf(ws);
    if (qi !== -1) waiting.splice(qi, 1);

    // Remove from room and notify partner
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

wss.on('connection', (ws) => {
    ws._name   = 'Player';
    ws._roomId = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'join') {
            ws._name = (msg.name || 'Player').substring(0, 20);

            if (waiting.length > 0) {
                // Match with the first waiting player
                const partner = waiting.shift();
                const roomId  = nextRoomId();
                const seed    = nextSeed();
                const room    = { id: roomId, seed, players: [partner, ws] };
                rooms.set(roomId, room);
                partner._roomId = roomId;
                ws._roomId      = roomId;

                send(partner, { type: 'matched', roomId, seed, opponentName: ws._name });
                send(ws,      { type: 'matched', roomId, seed, opponentName: partner._name });
            } else {
                // No partner yet â join the queue
                waiting.push(ws);
                send(ws, { type: 'waiting', roomId: null });
            }

        } else if (msg.type === 'state') {
            // Relay player state to the other member of the room
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
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
