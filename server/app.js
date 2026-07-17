// app.js — express app assembly; no listening, no scheduler, no Sentry.init
// (those live in the root server.js entry point)
const Sentry = require("@sentry/node");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression"); // gzip for performance
const path = require("path");
const apiRouter = require("./routes/api");
const { getSitemapPages } = require("./services/sitemap-metadata");

const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);

// Security: Force HTTPS in production (Render sets x-forwarded-proto)
if (isProduction && process.env.IS_PRERENDER !== "true") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Performance: Enable gzip compression
app.use(compression());

// Security: Add Helmet.js for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"], // Allow React inline scripts and blob workers
        workerSrc: ["'self'", "blob:"], // Allow blob workers
        // Explicit allowlist — only host currently embedding images is files.eliteprospects.com
        // (player photos in /roster and /recruiting). Add new hosts here if/when needed.
        imgSrc: ["'self'", "data:", "https://files.eliteprospects.com"],
        connectSrc: ["'self'", "https://*.sentry.io", "https://sentry.io"], // Allow Sentry ingest
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for React compatibility
  }),
);

// Security: Configure CORS with environment-based allowed origins
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : isProduction
    ? [] // In production, require explicit configuration
    : ["http://localhost:3000", "http://localhost:3001"]; // Default to common dev ports

console.log("Allowed CORS origins:", allowedOrigins);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Check if origin is in allowed list
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Security: Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all API routes
app.use("/api/", apiLimiter);

// Liveness probe — top-level, bypasses /api/ rate limiter and does no work.
// Used by Render's healthCheckPath; must remain dependency-free.
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiRouter);

// Sitemap
app.get("/sitemap.xml", (req, res) => {
  const baseUrl = process.env.SITE_BASE_URL || "https://forksuppucks.com";
  const pages = getSitemapPages();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;
  res.header("Content-Type", "application/xml");
  res.send(xml);
});

// Serve the React application's static files from the 'build' directory
app.use(express.static(path.join(__dirname, "..", "build")));

// Sentry Error Handler must be after all controllers and before other error middleware (if any)
Sentry.setupExpressErrorHandler(app);

// For any other request, serve the React app's index.html file
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "build", "index.html"));
});

module.exports = app;
