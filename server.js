const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global runtime mode
global.DB_MODE = 'mongo'; // 'mongo' | 'memory'

async function connectMongo() {
  const baseOptions = { serverSelectionTimeoutMS: 1500 };
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/idurar-erp-crm';
  try {
    await mongoose.connect(uri, baseOptions);
    console.log('✅ MongoDB connected successfully:', uri);
    global.DB_MODE = 'mongo';
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed, switching to in-memory mode:', err.message);
    global.DB_MODE = 'memory';
  }
}

// Connect DB (non-blocking for memory mode)
connectMongo();

// Routes
app.use('/api/customers', require('./routes/customers'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/queries', require('./routes/queries'));
app.use('/api/auth', require('./routes/auth'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    dbMode: global.DB_MODE,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
