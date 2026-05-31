const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// In production, serve the React build artifacts from client/dist
app.use(express.static(path.join(__dirname, 'client/dist')));

// Express routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// For React routing in production, send all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Not Found');
    }
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory database of rooms
// Structure:
// rooms = {
//   [roomId]: {
//     elements: [],      // array of committed shapes/paths
//     users: {},         // socket.id -> { socketId, nickname, color, cursor: {x, y}, currentTool }
//     chatHistory: []    // array of messages { id, senderId, senderName, color, text, timestamp }
//   }
// }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoomId = null;

  // Handle joining a room
  socket.on('join-room', ({ roomId, nickname, color }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    // Get or create room state
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        elements: [],
        users: {},
        chatHistory: []
      });
    }

    const room = rooms.get(roomId);
    
    // Add user to room state
    const user = {
      socketId: socket.id,
      nickname: nickname || `User-${socket.id.substring(0, 4)}`,
      color: color || '#FF5733',
      cursor: { x: null, y: null },
      currentTool: 'select'
    };
    
    room.users[socket.id] = user;

    console.log(`User ${user.nickname} (${socket.id}) joined room ${roomId}`);

    // Send existing room history and list of users to the joining client
    socket.emit('room-init', {
      elements: room.elements,
      users: Object.values(room.users),
      chatHistory: room.chatHistory,
      yourSocketId: socket.id
    });

    // Broadcast user joined to other clients in room
    socket.to(roomId).emit('user-joined', user);
  });

  // Handle cursor movement
  socket.on('cursor-move', ({ x, y, currentTool }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const user = room.users[socket.id];
    if (user) {
      user.cursor = { x, y };
      user.currentTool = currentTool;
      // Broadcast cursor coordinates to other users in room
      socket.to(currentRoomId).emit('cursor-moved', {
        socketId: socket.id,
        nickname: user.nickname,
        color: user.color,
        x,
        y,
        currentTool
      });
    }
  });

  // Handle in-progress drawing (emits while dragging)
  socket.on('drawing-progress', (element) => {
    if (!currentRoomId) return;
    // Broadcast active line/shape rendering to other users in real time
    socket.to(currentRoomId).emit('drawing-progress-update', {
      socketId: socket.id,
      element
    });
  });

  // Handle committed drawing (emits on mouseup / shape finished)
  socket.on('drawing-commit', (element) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    
    // Save element to room list
    room.elements.push(element);
    
    // Broadcast the committed drawing element
    socket.to(currentRoomId).emit('drawing-committed', element);
  });

  // Handle undo drawing element
  socket.on('drawing-undo', ({ elementId }) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    
    // Remove element with specified ID
    room.elements = room.elements.filter(el => el.id !== elementId);
    
    // Broadcast undo action
    socket.to(currentRoomId).emit('drawing-undone', { elementId });
  });

  // Handle redo drawing element
  socket.on('drawing-redo', (element) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    
    // Re-add element to room list
    room.elements.push(element);
    
    // Broadcast redo action
    socket.to(currentRoomId).emit('drawing-redone', element);
  });

  // Handle clear canvas
  socket.on('canvas-clear', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    
    // Clear list
    room.elements = [];
    
    // Broadcast clear event
    io.in(currentRoomId).emit('canvas-cleared');
  });

  // Handle chat messaging
  socket.on('send-message', (text) => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    const user = room.users[socket.id];
    
    if (user) {
      const message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: socket.id,
        senderName: user.nickname,
        color: user.color,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      // Store in room history (limit to 50 items)
      room.chatHistory.push(message);
      if (room.chatHistory.length > 50) {
        room.chatHistory.shift();
      }
      
      // Broadcast message to all users in the room (including sender)
      io.in(currentRoomId).emit('new-message', message);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      
      if (room.users[socket.id]) {
        console.log(`User ${room.users[socket.id].nickname} left room ${currentRoomId}`);
        delete room.users[socket.id];
        
        // Notify others
        socket.to(currentRoomId).emit('user-left', { socketId: socket.id });
      }
      
      // Clean up room if no users remain
      if (Object.keys(room.users).length === 0) {
        console.log(`Room ${currentRoomId} is empty. Deleting...`);
        rooms.delete(currentRoomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Collaborative Whiteboard Server running on port ${PORT}`);
});
