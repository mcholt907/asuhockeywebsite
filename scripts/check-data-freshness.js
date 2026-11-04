const { sendSentryCheckIn } = require("./lib/sentry-monitor");
const HOUR = 60 * 60 * 1000;
// Independent ceilings do not trust deployed thresholds, labels, or ageMs:
// an old production deployment must not silently pass.
const MAX_AGES = Object.freeze({
  news: 48 * HOUR,
  schedule: 48 * HOUR,
  stats: 48 * HOUR,
  standings: 48 * HOUR,
  roster: 48 * HOUR,
  alumni: 48 * HOUR,
  transfers: 48 * HOUR,
  recruiting: 48 * HOUR,
});
const FUTURE_TOLERANCE = 5 * 60 * 1000;

function timestampAge(timestamp, now) {
  if (typeof timestamp !== "string" || !timestamp.trim()) return null;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time <= now + FUTURE_TOLERANCE
    ? now - time
    : null;
}

function assessFreshness(body, now = Date.now()) {
  const failures = [];
  const generatedAge = timestampAge(body?.generatedAt, now);
  if (generatedAge === null || generatedAge > 10 * 60 * 1000) {
    failures.push(
      "Production status response is missing a recent valid generation time",
    );
  }
  if (!Array.isArray(body?.datasets))
    return [...failures, "Production status response has no datasets"];
  for (const [name, maxAge] of Object.entries(MAX_AGES)) {
    const matches = body.datasets.filter((dataset) => dataset?.name === name);
    if (matches.length !== 1) {
      failures.push(`${name}: expected exactly one dataset`);
      continue;
    }
    const dataset = matches[0];
    if (
      !Number.isFinite(dataset.staleAfterMs) ||
      dataset.staleAfterMs <= 0 ||
      dataset.staleAfterMs > maxAge
    ) {
      failures.push(
        `${name}: deployed freshness threshold must be at most 48 hours`,
      );
    }
    const age = timestampAge(dataset.timestamp, now);
    if (age === null)
      failures.push(
        `${name}: refresh timestamp is missing, invalid, or in the future`,
      );
    else if (age > maxAge)
      failures.push(`${name}: last verified refresh exceeds 48 hours`);
    if (dataset.status !== "ok")
      failures.push(
        `${name}: production reports ${dataset.status || "unknown"}`,
      );
  }
  return failures;
}

async function checkProductionFreshness({
  baseUrl = "https://forksuppucks.com",
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const response = await fetchImpl(new URL("/api/status", baseUrl), {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Production status request failed (HTTP ${response.status})`,
    );
  const failures = assessFreshness(await response.json(), now());
  if (failures.length) throw new Error(failures.join("\n"));
}

async function main() {
  let failure;
  try {
    await checkProductionFreshness({
      baseUrl: process.env.SITE_BASE_URL || undefined,
    });
    console.log("[freshness] All production datasets passed");
  } catch (error) {
    failure = error;
    console.error("[freshness]", error.message);
  }
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.error(
      "[freshness] SENTRY_DSN is required for independent monitoring",
    );
    process.exitCode = 1;
  } else {
    try {
      await sendSentryCheckIn({
        dsn,
        monitorSlug: "hockey-production-freshness",
        status: failure ? "error" : "ok",
        schedule: "17 * * * *",
        checkinMargin: 60,
        maxRuntime: 5,
      });
      console.log("[freshness] Sentry check-in accepted");
    } catch (error) {
      console.error("[freshness]", error.message);
      process.exitCode = 1;
    }
  }
  if (failure) process.exitCode = 1;
}

if (require.main === module)
  main().catch(() => {
    console.error("[freshness] Check failed");
    process.exitCode = 1;
  });
module.exports = { assessFreshness, checkProductionFreshness };
