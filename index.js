import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import 'dotenv/config';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import configurePassport from './config/passport.js';
import analysisRoutes from './routes/analysis.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true,               // allows cookies to be sent cross-origin
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

configurePassport();
app.use(passport.initialize());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
});