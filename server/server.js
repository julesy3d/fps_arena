const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS settings to allow connections from your Next.js client
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // The origin of your Next.js app
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
  res.send('<h1>FPS Arena Server</h1>');
});

const players = {};

io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  // Initialize player state
  players[socket.id] = {
    id: socket.id,
    position: [0, 1.7, 0],
    rotation: [0, 0, 0, 1], // Quaternion
  };

  // Send the current state of all players to the new player
  socket.emit('currentPlayers', players);

  // Inform other players about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('playerMove', (playerData) => {
    players[socket.id] = playerData;
    // Broadcast the updated position to all other clients
    socket.broadcast.emit('playerMoved', players[socket.id]);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});