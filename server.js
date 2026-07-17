// server.js — entry point: env, Sentry, scheduler, listen.
// App assembly lives in server/app.js; routes in server/routes/api.js.
require("dotenv").config(); // Load environment variables
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // Sample 10% of traces & profiles in production, 100% in dev
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  profilesSampleRate: isProduction ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,
});

// Require after Sentry.init so instrumented modules see the client.
const app = require("./server/app");
const { startScheduler } = require("./server/scheduler");

const port = process.env.PORT || 5000;

// Start the background scheduler
if (process.env.IS_PRERENDER !== "true") {
  startScheduler();
}

app.listen(port, () => {
  console.log(`\n🚀 ASU Hockey Website Server`);
  console.log(`================================`);
  console.log(`Environment: ${isProduction ? "PRODUCTION" : "DEVELOPMENT"}`);
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
