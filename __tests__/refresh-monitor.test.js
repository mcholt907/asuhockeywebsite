const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pingRefreshMonitor } = require("../scripts/ping-refresh-monitor");

test("uses the existing site DSN to configure the daily schedule and report failure", async () => {
  let checkIn;
  await pingRefreshMonitor({
    status: "error",
    environment: {
      REACT_APP_SENTRY_DSN: "https://test-key@example.ingest.sentry.io/123",
    },
    fetchImpl: async (_, options) => {
      checkIn = JSON.parse(options.body.split("\n")[2]);
      return { ok: true, status: 200 };
    },
  });
  expect(checkIn).toMatchObject({
    monitor_slug: "hockey-daily-refresh",
    status: "error",
    monitor_config: {
      schedule: { type: "crontab", value: "0 6 * * *" },
      timezone: "America/Phoenix",
      checkin_margin: 720,
    },
  });
});

test("a failed Sentry request is surfaced to the runner", async () => {
  await expect(
    pingRefreshMonitor({
      status: "ok",
      environment: {
        SENTRY_DSN: "https://test-key@example.ingest.sentry.io/123",
      },
      fetchImpl: async () => {
        throw new Error("network failed with sensitive request URL");
      },
    }),
  ).rejects.toThrow("Sentry check-in request failed");
});

test("an unconfigured runner monitor fails visibly instead of silently skipping check-ins", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "unconfigured-monitor-"),
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(SENTRY_DSN|REACT_APP_SENTRY_DSN|SENTRY_CRON_MONITOR_URL)$/i.test(
          key,
        ),
    ),
  );
  try {
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, "../scripts/ping-refresh-monitor.js"), "ok"],
      { cwd: directory, env, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refresh monitoring is not configured");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
