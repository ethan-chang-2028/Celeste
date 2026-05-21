// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const PORT = 3000;

// Create the server
const server = http.createServer(async (req, res) => {
    try {
        // Build the path to your HTML file
        const filePath = path.join(__dirname, 'webSite', 'index.html');

        // Read the file from the hard drive
        const htmlContent = await fs.readFile(filePath, 'utf-8');

        // Send a success status (200) and tell the browser it's receiving HTML
        res.writeHead(200, { 'Content-Type': 'text/html' });

        // Send the HTML content
        res.end(htmlContent);

    } catch (error) {
        // If the file isn't found, send a 404 error
        console.error('Error reading file:', error.message);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: Could not find webSite/index.html');
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running! Open your browser to http://localhost:${PORT}`);
});