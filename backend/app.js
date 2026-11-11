
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { testConnection } from './src/config/db.js';
import authRoutes from './src/routes/auth.routes.js';
import materialRoutes from './src/routes/material.routes.js';
import { errorHandler, notFound } from './src/middleware/errors.js';

const app = express();

app.set('trust proxy', 1);

// ========================================
// CORS CONFIGURATION
// ========================================

const allowedOrigins = [
  'https://saed.rifazmuhammadsukma.id',
  ...(process.env.APP_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without Origin (e.g. server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error('CORS blocked origin:', origin);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

// CORS must run before API routes
app.use(cors(corsOptions));

// ========================================
// SECURITY & BODY PARSER
// ========================================

app.use(helmet());

app.use(express.json({ limit: '2mb' }));

// ========================================
// RATE LIMITING
// ========================================

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  })
);

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();

    res.json({
      success: true,
      service: 'saed-api',
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);

    res.status(503).json({
      success: false,
      service: 'saed-api',
      database: 'unavailable'
    });
  }
});

// ========================================
// API ROUTES
// ========================================

app.use('/api/auth', authRoutes);
app.use('/api/materials', materialRoutes);

// ========================================
// ERROR HANDLING
// ========================================

app.use(notFound);
app.use(errorHandler);

// ========================================
// START SERVER
// ========================================

const port = Number(process.env.PORT || 3000);

if (process.env.NODE_ENV !== 'test') {
  testConnection()
    .then(() => console.log('MySQL connected'))
    .catch(err => console.error('MySQL connection failed:', err.message));

  app.listen(port, '0.0.0.0', () => {
    console.log(`SAED API listening on port ${port}`);
    console.log('Allowed frontend origins:', allowedOrigins);
  });
}

export default app;
