const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json()); 
app.use(cors()); 

const FILE_PATH = path.join(__dirname, 'game-app', 'Data', 'players.json');

// Ensure directory and file exist
fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([]));
}

// Helper function to get current players from the JSON file
function getPlayers() {
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    return data ? JSON.parse(data) : [];
}

// ENDPOINT 1: Register a new user
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    let players = getPlayers();

    // Check if username already exists
    const userExists = players.find(player => player.username === username);
    if (userExists) {
        return res.status(400).json({ message: "Username is already taken!" });
    }

    // Save the new player
    const newPlayer = { 
        username: username, 
        password: password, 
        registeredAt: new Date().toISOString() 
    };

    players.push(newPlayer);
    fs.writeFileSync(FILE_PATH, JSON.stringify(players, null, 2));

    console.log(`New user registered: ${username}`);
    res.status(201).json({ message: "Account created successfully!" });
});

// ENDPOINT 2: Log in an existing user
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const players = getPlayers();

    // Check if username AND password match an entry in players.json
    const validUser = players.find(player => player.username === username && player.password === password);

    if (validUser) {
        console.log(`User logged in: ${username}`);
        res.status(200).json({ message: "Login successful!" });
    } else {
        res.status(401).json({ message: "Invalid username or password!" });
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});