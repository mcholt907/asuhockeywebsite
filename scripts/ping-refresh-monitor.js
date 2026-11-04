// Report runner completion separately from production delivery.
require("dotenv").config({ quiet: true });
const { sendSentryCheckIn } = require("./lib/sentry-monitor");

async function pingRefreshMonitor({
  status,
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  if (!["ok", "error"].includes(status))
    throw new Error("Expected ok or error");
  const dsn = environment.SENTRY_DSN || environment.REACT_APP_SENTRY_DSN;
  if (dsn) {
    await sendSentryCheckIn({
      dsn,
      monitorSlug: "hockey-daily-refresh",
      status,
      schedule: "0 6 * * *",
      timezone: "America/Phoenix",
      checkinMargin: 720,
      maxRuntime: 30,
      fetchImpl,
    });
  } else if (environment.SENTRY_CRON_MONITOR_URL) {
    const url = new URL(environment.SENTRY_CRON_MONITOR_URL);
    url.searchParams.set("status", status);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Monitor rejected check-in (HTTP ${response.status})`);
  } else {
    throw new Error(
      "SENTRY_DSN is required; refresh monitoring is not configured",
    );
  }
  console.log(`[refresh-monitor] check-in accepted (${status})`);
}

if (require.main === module) {
  pingRefreshMonitor({ status: process.argv[2] }).catch((error) => {
    console.error(`[refresh-monitor] ${error.message}`);
    // The runner treats monitoring failures nonfatally and records them.
    process.exitCode = 1;
  });
}
module.exports = { pingRefreshMonitor };
