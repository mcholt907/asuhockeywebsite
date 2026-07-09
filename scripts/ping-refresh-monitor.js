// Dead-man's-switch check-in for the weekly data refresh task
// (scripts/refresh-and-push.cmd). Pings a Sentry Cron Monitor so a run
// that never happens (machine asleep Sunday 06:00) or fails part-way
// raises an alert within the monitor's grace period, instead of silently
// serving stale fallback JSON until the 21-day threshold in data-status.js.
//
// Setup (one-time): in Sentry, create a Cron Monitor (Crons → Add Monitor,
// schedule: weekly on Sunday 06:00 America/Phoenix, grace period ~12h),
// then copy its HTTP check-in URL into .env as SENTRY_CRON_MONITOR_URL.
// Unset URL = check-ins are skipped, so the refresh flow still works
// without Sentry configured.
//
// Usage: node scripts/ping-refresh-monitor.js [ok|error]
require("dotenv").config();

const baseUrl = process.env.SENTRY_CRON_MONITOR_URL;
const status = process.argv[2] === "error" ? "error" : "ok";

if (!baseUrl) {
  console.log(
    "[refresh-monitor] SENTRY_CRON_MONITOR_URL not set; skipping check-in",
  );
  process.exit(0);
}

const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}status=${status}`;

fetch(url, { signal: AbortSignal.timeout(15000) })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[refresh-monitor] check-in sent (${status})`);
  })
  .catch((err) => {
    // Never fail the refresh over a monitoring ping — a missed check-in
    // already raises the alert on Sentry's side.
    console.error(`[refresh-monitor] check-in failed: ${err.message}`);
  });
