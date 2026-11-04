const {
  assessFreshness,
  checkProductionFreshness,
} = require("../scripts/check-data-freshness");
const { sendSentryCheckIn } = require("../scripts/lib/sentry-monitor");

const NOW = Date.parse("2026-11-04T16:00:00Z");
const HOUR = 3600000;
function healthyStatus() {
  return {
    generatedAt: new Date(NOW).toISOString(),
    datasets: [
      "news",
      "schedule",
      "stats",
      "standings",
      "roster",
      "alumni",
      "transfers",
      "recruiting",
    ].map((name) => ({
      name,
      status: "ok",
      timestamp: new Date(NOW - HOUR).toISOString(),
      ageMs: HOUR,
      staleAfterMs: 48 * HOUR,
      alert: true,
    })),
  };
}

test("accepts a complete recent production response", () => {
  expect(assessFreshness(healthyStatus(), NOW)).toEqual([]);
});

test("independently rejects old data even when production reports ok with its former 21-day threshold", () => {
  const body = healthyStatus();
  const alumni = body.datasets.find((d) => d.name === "alumni");
  Object.assign(alumni, {
    timestamp: new Date(NOW - 49 * HOUR).toISOString(),
    ageMs: 0,
    staleAfterMs: 21 * 24 * HOUR,
  });
  expect(assessFreshness(body, NOW).join(" ")).toMatch(/alumni.*48/i);
});

test("rejects an old deployment policy even when a fresh checkout makes its timestamps look recent", () => {
  const body = healthyStatus();
  body.datasets.find((dataset) => dataset.name === "recruiting").staleAfterMs =
    21 * 24 * HOUR;
  expect(assessFreshness(body, NOW).join(" ")).toMatch(
    /recruiting.*threshold.*48/,
  );
});

test.each(["missing", "unknown", "stale"])(
  "rejects a dataset reported as %s",
  (status) => {
    const body = healthyStatus();
    body.datasets[0].status = status;
    expect(assessFreshness(body, NOW).join(" ")).toContain("news");
  },
);

test.each([null, "invalid", new Date(NOW + HOUR).toISOString()])(
  "rejects unverified timestamps: %s",
  (timestamp) => {
    const body = healthyStatus();
    body.datasets[0].timestamp = timestamp;
    expect(assessFreshness(body, NOW).join(" ")).toContain("news");
  },
);

test("rejects missing datasets and stale status responses", () => {
  const body = healthyStatus();
  body.datasets.pop();
  body.generatedAt = new Date(NOW - HOUR).toISOString();
  const errors = assessFreshness(body, NOW).join(" ");
  expect(errors).toContain("recruiting");
  expect(errors).toMatch(/status response/i);
});

test("production HTTP failures cannot count as successful checks", async () => {
  await expect(
    checkProductionFreshness({
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
  ).rejects.toThrow("HTTP 503");
});

test("sends a Sentry cron envelope with schedule and status using the existing DSN", async () => {
  let request;
  await sendSentryCheckIn({
    dsn: "https://public-key@example.ingest.sentry.io/123",
    monitorSlug: "hockey-daily-refresh",
    status: "ok",
    schedule: "0 6 * * *",
    timezone: "America/Phoenix",
    checkinMargin: 720,
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options };
      return { ok: true, status: 200 };
    },
  });
  expect(request.url).toBe(
    "https://example.ingest.sentry.io/api/123/envelope/?sentry_key=public-key&sentry_version=7",
  );
  const lines = request.body.split("\n").map((line) => JSON.parse(line));
  expect(lines[1]).toEqual({ type: "check_in" });
  expect(lines[2]).toMatchObject({
    monitor_slug: "hockey-daily-refresh",
    status: "ok",
    environment: "production",
    monitor_config: {
      schedule: { type: "crontab", value: "0 6 * * *" },
      timezone: "America/Phoenix",
      checkin_margin: 720,
    },
  });
});

test("Sentry rejection is surfaced without disclosing credentials", async () => {
  await expect(
    sendSentryCheckIn({
      dsn: "https://private-key@example.ingest.sentry.io/123",
      monitorSlug: "test",
      status: "ok",
      schedule: "17 * * * *",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
  ).rejects.toThrow("Sentry check-in rejected (HTTP 403)");
});
