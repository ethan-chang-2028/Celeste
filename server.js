// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

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
        // 2. Serve the HTML file
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
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

        // 3c. Serve the game test page and its assets
        const gameAssets = {
            '/game':          { file: 'game.html',    type: 'text/html' },
            '/game.html':     { file: 'game.html',    type: 'text/html' },
            '/game.js':       { file: 'game.js',      type: 'application/javascript' },
            '/game.css':      { file: 'game.css',     type: 'text/css' },
            '/player.js':     { file: 'player.js',    type: 'application/javascript' },
            '/ai-neural.js':  { file: 'ai-neural.js', type: 'application/javascript' },
        };
        if (req.method === 'GET' && gameAssets[req.url]) {
            const { file, type } = gameAssets[req.url];
            const filePath = path.join(__dirname, 'game-app', 'webSite', file);
            const content = await fs.readFile(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': type });
            return res.end(content);
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

        // 6. AI model weights — GET loads, POST saves
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
            await fs.mkdir(path.dirname(AI_MODEL_PATH), { recursive: true });
            await fs.writeFile(AI_MODEL_PATH, JSON.stringify(data, null, 2));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'AI model saved.' }));
        }

        // 7. Leaderboard — GET loads, POST appends a run record
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
            } catch { /* file missing or corrupt — start fresh */ }
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

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});
