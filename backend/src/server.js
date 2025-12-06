const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const categoryRoutes = require('./routes/categoryRoutes');
const documentRoutes = require('./routes/documentRoutes');
const searchRoutes = require('./routes/searchRoutes');
const groupRoutes = require('./routes/groupRoutes');
const groupActivityRoutes = require('./routes/groupActivityRoutesNew');
const inviteRoutes = require('./routes/inviteRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const ragRoutes = require('./routes/ragRoutes');
const migrationRoutes = require('./routes/migrationRoutes');
const userRoutes = require('./routes/userRoutes');
const integrationRoutes = require('./routes/integrations');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers

// CORS configuration - Updated for localhost:5173
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];
    
    // Set CORS headers for all requests
    if (allowedOrigins.includes(origin) || !origin) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] 🌐 CORS Preflight request: ${req.method} ${req.url}`);
        console.log(`   Origin: ${origin}`);
        console.log(`   User-Agent: ${req.headers['user-agent']}`);
        return res.sendStatus(200);
    }
    
    next();
});

// Also use cors middleware as backup with specific configuration
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Enhanced CORS debugging middleware with timing
app.use((req, res, next) => {
    const start = Date.now();
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] 🌐 CORS Request: ${req.method} ${req.url}`);
    console.log(`   Origin: ${req.headers.origin}`);
    console.log(`   User-Agent: ${req.headers['user-agent']}`);
    console.log(`   Authorization: ${req.headers.authorization ? 'Present' : 'Missing'}`);
    
    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] 📤 Response: ${res.statusCode} (${duration}ms)`);
    });
    
    next();
});

app.use(morgan('dev')); // Logging
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/categories', categoryRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', groupActivityRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integrations', integrationRoutes);

// Enhanced 404 handler with detailed logging
app.use((req, res) => {
  const timestamp = new Date().toISOString();
  const errorDetails = {
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    timestamp
  };
  
  console.log(`[${timestamp}] ❌ 404 Not Found: ${req.method} ${req.path}`);
  console.log(`   Origin: ${req.headers.origin}`);
  console.log(`   User-Agent: ${req.headers['user-agent']}`);
  console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
  
  res.status(404).json(errorDetails);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
