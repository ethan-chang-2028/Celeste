// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const PORT = 3000;
const DATA_FILE_PATH = path.join(__dirname, 'game-app', 'Data', 'players.json');
const BRIDGE_JS_PATH = path.join(__dirname, 'translation-layer', 'js-bridge.js');

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

// --- Helper: Ensure the players.json file exists when the server starts ---
async function initDataFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
        let needsInit = false;
        try {
            const content = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            JSON.parse(content || 'null'); // throws if corrupt
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

        // 3. Serve the JavaScript file
        if (req.method === 'GET' && req.url === '/app.js') {
            const filePath = path.join(__dirname, 'game-app', 'webSite', 'app.js');
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

        // 4. Handle Registration POST Request
        if (req.method === 'POST' && req.url === '/register') {
            const data = await getRequestBody(req);
            const isBridge = isBridgeRequest(req);

            // Bridge clients wrap credentials in data.payload; plain clients send them directly
            const username = isBridge ? data.payload?.username : data.username;
            const password = isBridge ? data.payload?.password : data.password;

            // Read current players
            const fileData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            let players;
            try { players = JSON.parse(fileData); } catch { players = []; }
            if (!Array.isArray(players)) players = [];

            // Check if username exists
            if (players.find(p => p.username === username)) {
                return sendResponse(res, 400, 'auth.response',
                    { message: "Username is already taken!" }, req);
            }

            // Save new player
            players.push({ username, password, registeredAt: new Date().toISOString() });
            await fs.writeFile(DATA_FILE_PATH, JSON.stringify(players, null, 2));

            return sendResponse(res, 201, 'auth.response',
                { message: "Account created successfully!" }, req);
        }

        // 5. Handle Login POST Request
        if (req.method === 'POST' && req.url === '/login') {
            const data = await getRequestBody(req);
            const isBridge = isBridgeRequest(req);

            // Bridge clients wrap credentials in data.payload; plain clients send them directly
            const username = isBridge ? data.payload?.username : data.username;
            const password = isBridge ? data.payload?.password : data.password;

            // Read current players
            const fileData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            let players;
            try { players = JSON.parse(fileData); } catch { players = []; }
            if (!Array.isArray(players)) players = [];

            // Check if credentials match
            const validUser = players.find(
                p => p.username === username && p.password === password
            );

            if (validUser) {
                return sendResponse(res, 200, 'auth.response',
                    { message: "Login successful!", username: validUser.username }, req);
            } else {
                return sendResponse(res, 401, 'auth.response',
                    { message: "Invalid username or password!" }, req);
            }
        }

        // 6. Catch-all for files or routes not found
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