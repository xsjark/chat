const express = require('express');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const port = 3000;

// Create server
const server = http.createServer(app);

// Setup Socket.IO
const io = socketIo(server);

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded requests

// Extend dayjs with UTC and Timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const formatTime = () => {
    return `@ ${dayjs().tz('Asia/Brunei').format('HH:mm')}`;
};

const users = {};
const chatHistories = {};
const activeUsernames = new Set();
const bannedDevices = new Set();

// Chat for mobile
app.get('/api/chat/:borderName', (req, res) => {
    const { borderName } = req.params;

    if (!borderName) {
        return res.status(400).json({ error: 'Border name is required' });
    }

    if (!chatHistories[borderName]) {
        chatHistories[borderName] = [];
    }

    const result = {
        chat: chatHistories[borderName],
    };

    res.status(200).json(result);
});

app.post('/api/chat/:borderName', async (req, res) => {
    console.log("Route /api/chat/:borderName called with:", req.params, req.body);
    try {
        const { borderName } = req.params;
        const { message, deviceId } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid or missing message' });
        }
        if (!deviceId || typeof deviceId !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing deviceId' });
        }

        if (message.length > 50) {
            return res.status(400).json({ error: 'Message too long' });
        }

        if (bannedDevices.has(deviceId)) {
            return res.status(403).json({ error: 'You have been banned from the chat' });
        }

        let username = users[deviceId];
        if (!username) {
            username = await generateUsername(deviceId);
            users[deviceId] = username;
            activeUsernames.add(username);
        }

        if (!chatHistories[borderName]) {
            chatHistories[borderName] = [];
        }

        const sanitizedMessage = sanitizeHtml(message);
        const timestampedMessage = `${username} ${formatTime()}: ${sanitizedMessage}`;

        chatHistories[borderName].push(timestampedMessage);

        if (chatHistories[borderName].length > 100) {
            chatHistories[borderName] = chatHistories[borderName].slice(-100);
        }

        io.to(borderName).emit('chat message', timestampedMessage);
        console.log(`[SERVER] Chat message sent to ${borderName}`);

        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error in chat post:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join', (borderName) => {
        socket.join(borderName);
        console.log(`Client joined room: ${borderName}`);
    });

    socket.on('disconnect', () => console.log('Client disconnected'));
});

function sanitizeHtml(input) {
    return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function generateUsername(deviceIdentifier) {
    try {
        let username;
        let attempts = 0;
        const maxAttempts = 1;

        while (attempts < maxAttempts) {
            const response = await axios.get('https://random-word-api.herokuapp.com/word?length=5');
            const randomWord = response.data[0];
            username = `${randomWord}`;

            if (!activeUsernames.has(username)) {
                activeUsernames.add(username);
                return username;
            }
            attempts++;
        }

        // Fallback if we couldn't get a unique username
        const timestamp = Date.now().toString().slice(-4);
        username = `user_${deviceIdentifier.substring(0, 3)}${timestamp}`;
        activeUsernames.add(username);
        return username;
    } catch (error) {
        console.error('Error generating username:', error);
        const fallback = `user_${deviceIdentifier.substring(0, 3)}${Date.now().toString().slice(-4)}`;
        activeUsernames.add(fallback);
        return fallback;
    }
}

// Start the server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
