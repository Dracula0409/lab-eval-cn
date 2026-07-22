// index.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import apiRoutes from './routes/index.js';
import { initSSHWebSocket } from './controllers/sshController.js';
import { connectDB, disconnectDB } from './utils/db.js'; 
import { startSSHPoolReaper } from './utils/sshConnectionPool.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Only honour X-Forwarded-For when the deployment is explicitly configured
// behind one trusted reverse proxy. Otherwise that header is client-spoofable.
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

// Middlewares
const allowedOrigins = [
  "http://localhost:5173", 
  "http://10.16.16.107:5173",
  "http://10.5.1.4:5173",
  "http://192.168.137.131:5173",
  "http://10.5.1.122:5173",
  //"http://10.7.103.226:5173",
  //"http://10.5.12.254:5173",
  //"http://192.168.1.200:5173",
  //"http://10.21.68.19:5173"     //library
];

app.use(cors({
  origin : (origin, callback) => {
    const isLocalDev = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+):\d+$/.test(origin || '');
    if(!origin || allowedOrigins.includes(origin) || isLocalDev){
      callback(null, true);
    }
    else{
      callback(new Error("Not Allowed by CORS."));
    }
  },
  credentials: true, 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
// Make sure path is absolute to avoid any path resolution issues
app.use(express.static(path.join(process.cwd(), 'public')));
// Explicitly serve uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// REST API routes
app.use('/api', apiRoutes);

// Initialize SSH WebSocket handler (handles /ws/ssh upgrades)
initSSHWebSocket(server);

// Graceful shutdown handler for DB
process.on('SIGINT', async () => {
  console.log('\nCaught SIGINT, shutting down...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nCaught SIGTERM, shutting down...');
  await disconnectDB();
  process.exit(0);
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  startSSHPoolReaper();
});
