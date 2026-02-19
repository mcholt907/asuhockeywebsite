// server.js
require('dotenv').config(); // Load environment variables
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression'); // Add compression for performance
const { fetchNewsData, fetchScheduleData, scrapeCHNStats } = require('./scraper'); // Import the news fetching function and new stats fetching function
const { scrapeTransferData } = require('./transfer-scraper'); // Import transfer scraper
const { scrapeAlumniData } = require('./alumni-scraper'); // Import alumni scraper
const { startScheduler } = require('./src/scripts/scheduler'); // Import scheduler
const { getRoster } = require('./services/roster-service');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Start the background scheduler
startScheduler();

// Sentry: The request handler must be the first middleware on the app
// Sentry: The request handler and tracing handler are no longer needed in v8+
// app.use(Sentry.Handlers.requestHandler());
// app.use(Sentry.Handlers.tracingHandler());

// Performance: Enable gzip compression
app.use(compression());

// Security: Add Helmet.js for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"], // Allow images from any HTTPS source
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for React compatibility
}));

// Security: Configure CORS with environment-based allowed origins
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : (isProduction
    ? [] // In production, require explicit configuration
    : ['http://localhost:3000', 'http://localhost:3001']); // Default to common dev ports

console.log('Allowed CORS origins:', allowedOrigins);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Check if origin is in allowed list
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// API endpoint for news
app.get('/api/news', async (req, res) => {
  try {
    const articlesArray = await fetchNewsData(); // fetchNewsData now returns an array of articles or an empty array on error

    if (articlesArray && articlesArray.length > 0) {
      // If articles are found, send them in the expected object structure
      res.json({
        data: articlesArray,
        source: 'api', // Simplified source, as fetchNewsData doesn't specify cache/live anymore
        timestamp: new Date().toISOString() // Add a current timestamp
      });
    } else {
      // If articlesArray is empty or null, it means no articles were found or an error occurred during scraping
      console.error('/api/news: No news data returned from fetchNewsData or an error occurred internally in scraper.');
      res.status(500).json({ error: 'Failed to fetch news data or no news available.' });
    }
  } catch (error) {
    // This catch block handles unexpected errors in the endpoint logic itself
    console.error('Error in /api/news endpoint:', error);
    res.status(500).json({ error: 'Internal server error while fetching news.' });
  }
});

// API endpoint for schedule data
app.get('/api/schedule', async (req, res) => {
  try {
    const scheduleDataArray = await fetchScheduleData(); // fetchScheduleData now returns an array of games or an empty array on error

    if (scheduleDataArray && scheduleDataArray.length > 0) {
      res.json({
        data: scheduleDataArray,
        source: 'api', // Simplified source
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('/api/schedule: No schedule data returned from fetchScheduleData or an error occurred internally in scraper.');
      res.status(500).json({ error: 'Failed to fetch schedule data or no schedule available.' });
    }
  } catch (error) {
    console.error('Error in /api/schedule endpoint:', error);
    res.status(500).json({ error: 'Internal server error while fetching schedule data.' });
  }
});

// API endpoint for recruiting data — reads directly from static JSON (source of truth)
app.get('/api/recruits', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'asu_hockey_data.json'), 'utf8');
    const data = JSON.parse(raw);
    res.json(data.recruiting || {});
  } catch (error) {
    console.error('[API /recruits] Error reading recruiting data:', error.message);
    res.status(500).json({ error: 'Failed to fetch recruiting data' });
  }
});

// API endpoint for transfer data (incoming/outgoing transfers)
app.get('/api/transfers', async (req, res) => {
  try {
    console.log('[API /transfers] Fetching transfer data...');
    const transferData = await scrapeTransferData();
    console.log(`[API /transfers] Returning ${transferData.incoming?.length || 0} incoming, ${transferData.outgoing?.length || 0} outgoing transfers`);
    res.json(transferData);
  } catch (error) {
    console.error('[API /transfers] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch transfer data',
      message: error.message
    });
  }
});

// API endpoint for alumni data (Where Are They Now?)
app.get('/api/alumni', async (req, res) => {
  try {
    console.log('[API /alumni] Fetching alumni data...');
    const alumniData = await scrapeAlumniData();
    console.log(`[API /alumni] Returning ${alumniData.skaters?.length || 0} skaters, ${alumniData.goalies?.length || 0} goalies`);
    res.json(alumniData);
  } catch (error) {
    console.error('[API /alumni] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch alumni data',
      message: error.message
    });
  }
});

// API endpoint for roster data
app.get('/api/roster', async (req, res) => {
  try {
    const roster = await getRoster();
    if (roster.length > 0) {
      res.json(roster);
    } else {
      res.status(404).json({ error: 'Roster data not found.' });
    }
  } catch (error) {
    console.error('Error in /api/roster:', error);
    res.status(500).json({ error: 'Internal server error while fetching roster data.' });
  }
});


app.get('/api/stats', async (req, res) => {
  try {
    // scrapeCHNStats handles cache check, SWR, and coalescing internally
    const statsData = await scrapeCHNStats();
    if (statsData.skaters.length > 0 || statsData.goalies.length > 0) {
      res.json(statsData);
    } else {
      res.status(500).json({ error: 'Failed to fetch stats data.' });
    }
  } catch (error) {
    console.error('Error in /api/stats endpoint:', error);
    res.status(500).json({ error: 'Internal server error while fetching stats.' });
  }
});

// Serve the React application's static files from the 'build' directory
app.use(express.static(path.join(__dirname, 'build')));


// Sentry Error Handler must be after all controllers and before other error middleware (if any)
// Sentry Error Handler (v8+)
Sentry.setupExpressErrorHandler(app);

// For any other request, serve the React app's index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Production: Serve React static files
if (isProduction) {
  // Serve static files from the React build folder
  app.use(express.static(path.join(__dirname, 'build')));

  // Catch-all handler for React Router (must be after API routes)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`\n🚀 ASU Hockey Website Server`);
  console.log(`================================`);
  console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`Server: http://localhost:${port}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  News:      http://localhost:${port}/api/news`);
  console.log(`  Roster:    http://localhost:${port}/api/roster`);
  console.log(`  Recruits:  http://localhost:${port}/api/recruits`);
  console.log(`  Schedule:  http://localhost:${port}/api/schedule`);
  console.log(`  Stats:     http://localhost:${port}/api/stats`);
  console.log(`  Alumni:    http://localhost:${port}/api/alumni`);
  console.log(`================================\n`);
});
