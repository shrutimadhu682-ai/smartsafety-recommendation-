// ============================================================
// ZENSAFE – Express Server
// Full-stack safety navigation app backend
// ============================================================

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const morgan     = require('morgan');
const path       = require('path');

// Import all routes
const reportsRouter  = require('./routes/reports');
const contactsRouter = require('./routes/contacts');
const alertsRouter   = require('./routes/alerts');
const sosRouter      = require('./routes/sos');
const locationRouter = require('./routes/location');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────
// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   [
                "'self'", "'unsafe-inline'",
                "https://unpkg.com",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://leaflet.github.io"
            ],
            styleSrc:    [
                "'self'", "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc:     [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com",
                "data:"
            ],
            imgSrc:      [
                "'self'", "data:", "blob:",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://*.openstreetmap.org"
            ],
            connectSrc:  [
                "'self'",
                "https://*.tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://*.openstreetmap.org"
            ],
            mediaSrc:    ["'self'", "blob:", "data:"],
            workerSrc:   ["'self'", "blob:"],
            objectSrc:   ["'none'"],
            frameAncestors: ["'none'"]
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

// GZIP compression
app.use(compression());

// CORS – allow same-origin + development origins
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGIN || true  // same-origin in prod
        : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── STATIC FILES ─────────────────────────────────────────────
// Serve frontend from the Project_Safety subdirectory
const STATIC_DIR = path.join(__dirname, 'Project_Safety');
app.use(express.static(STATIC_DIR, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    index: 'index.html'
}));

// ─── API ROUTES ────────────────────────────────────────────────
app.use('/api/reports',  reportsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/alerts',   alertsRouter);
app.use('/api/sos',      sosRouter);
app.use('/api/location', locationRouter);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'ZENSAFE',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development'
    });
});

// API 404
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `API endpoint '${req.originalUrl}' not found` });
});

// ─── SPA FALLBACK ──────────────────────────────────────────────
// Serve frontend for any non-API GET request (SPA routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ─── GLOBAL ERROR HANDLER ──────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack);

    if (res.headersSent) return next(err);

    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

// ─── START SERVER ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\n🛡️  ZENSAFE Server Running`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Env:     ${process.env.NODE_ENV || 'development'}`);
    console.log(`   API:     http://localhost:${PORT}/api/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[SERVER] SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('[SERVER] HTTP server closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n[SERVER] SIGINT received. Shutting down...');
    server.close(() => process.exit(0));
});

module.exports = app; // for testing
