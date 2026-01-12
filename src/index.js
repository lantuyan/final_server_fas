import express from 'express';
import bodyParser from 'body-parser';
import { saveData } from './main.js';
import apiRoutes from './api.js';
import cors from 'cors';
import { authenticateToken } from './middleware.js';

const app = express();

// Security and CORS middleware
app.use(cors());
app.use(bodyParser.json());

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Apply authentication middleware to API routes
app.use('/api', authenticateToken, apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start MQTT connection and sensor monitoring
saveData();

// Start server - listen on all network interfaces
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
}); 