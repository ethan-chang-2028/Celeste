// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const PORT = 3000;
const DATA_FILE_PATH = path.join(__dirname, 'game-app', 'Data', 'players.json');

// --- Helper: Ensure the players.json file exists when the server starts ---
async function initDataFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
        try {
            await fs.access(DATA_FILE_PATH);
        } catch {
            // File doesn't exist, create it with an empty array
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

        // 4. Handle Registration POST Request
        if (req.method === 'POST' && req.url === '/register') {
            const data = await getRequestBody(req);

            // Read current players
            const fileData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            const players = JSON.parse(fileData || '[]');

            // Check if username exists
            if (players.find(p => p.username === data.username)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: "Username is already taken!" }));
            }

            // Save new player
            players.push({ 
                username: data.username, 
                password: data.password, 
                registeredAt: new Date().toISOString() 
            });
            await fs.writeFile(DATA_FILE_PATH, JSON.stringify(players, null, 2));

            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: "Account created successfully!" }));
        }

        // 5. Handle Login POST Request
        if (req.method === 'POST' && req.url === '/login') {
            const data = await getRequestBody(req);

            // Read current players
            const fileData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
            const players = JSON.parse(fileData || '[]');

            // Check if credentials match
            const validUser = players.find(p => p.username === data.username && p.password === data.password);

            if (validUser) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: "Login successful!" }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: "Invalid username or password!" }));
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