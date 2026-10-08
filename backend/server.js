
// Load environment variables from .env file
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path'); // <--- 1. ADD PATH MODULE
const { Server } = require('socket.io');

// Load database connection & schema initialization
const db = require('./config/db'); // <--- ADD THIS LINE

// Route Imports
const deviceRoutes = require('./routes/deviceRoutes');
const locationRoutes = require('./routes/locationRoutes');
const routeRoutes = require('./routes/routeRoutes');

// New Role-based Route Imports
const authRoutes = require('./routes/authRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const driverRoutes = require('./routes/driverRoutes');
const parentRoutes = require('./routes/parentRoutes');

// Socket Handler Import
const initLocationSocket = require('./sockets/locationSocket'); // <--- 1. IMPORT SOCKET HANDLER
const { initSmsSocket } = require('./sockets/smsSocket');

// Initialize Express application
const app = express();

// Enable Middleware
// CORS allows requests from external domains (crucial when testing with ngrok/React)
app.use(cors());
// JSON parser allows Express to parse incoming JSON payloads in request bodies
app.use(express.json());

// API Routes (existing — untouched)
app.use('/api/devices', deviceRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/routes', routeRoutes);

// New Role-based API Routes
app.use('/api/auth', authRoutes);
app.use('/api/operator', operatorRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/parent', parentRoutes);

// Health-check endpoint to verify backend is responding
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Location Tracker Backend Running' });
});

// =========================================================
// 2. ADD THIS: SERVE FRONTEND STATIC FILES & SPA FALLBACK
// =========================================================
const distPath = path.join(__dirname, '../frontend/dist'); // Points to location-tracker-poc/frontend/dist
app.use(express.static(distPath));

// SPA Fallback: Return index.html for non-API frontend page requests
app.get('*splat', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});
// =========================================================

// Create HTTP & Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Expose Socket.IO instance so HTTP controllers can emit events
app.set('io', io);

// Initialize Socket.IO Handlers
initLocationSocket(io);

// Initialize raw WebSocket handler for Flutter SMS gateway
initSmsSocket(server);


// Define Server Port from .env or fallback to 5000
const PORT = process.env.PORT || 5000;

// Do not accept requests until schema upgrades and legacy backfills complete.
db.ready.then(() => {
  server.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`=================================`);
  });
}).catch((err) => {
  console.error('❌ Database initialization failed:', err.message);
  process.exitCode = 1;
});