const { randomUUID } = require("node:crypto");

// Sentry check-in envelopes use Node builtins so the cloud monitor needs no
// npm installation or scraper dependencies.
async function sendSentryCheckIn({
  dsn,
  monitorSlug,
  status,
  schedule,
  timezone = "UTC",
  checkinMargin = 30,
  maxRuntime = 5,
  fetchImpl = fetch,
}) {
  if (!["ok", "error"].includes(status))
    throw new Error("Invalid monitor status");
  let endpoint;
  try {
    const parsed = new URL(dsn);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const project = parts.pop();
    if (
      parsed.protocol !== "https:" ||
      !parsed.username ||
      !/^\d+$/.test(project)
    )
      throw new Error();
    endpoint = new URL(
      `${parsed.origin}/${[...parts, "api", project, "envelope"].join("/")}/`,
    );
    endpoint.searchParams.set("sentry_key", parsed.username);
    endpoint.searchParams.set("sentry_version", "7");
  } catch {
    throw new Error("Invalid Sentry DSN");
  }
  const body = [
    { sent_at: new Date().toISOString() },
    { type: "check_in" },
    {
      check_in_id: randomUUID().replaceAll("-", ""),
      monitor_slug: monitorSlug,
      status,
      environment: "production",
      monitor_config: {
        schedule: { type: "crontab", value: schedule },
        timezone,
        checkin_margin: checkinMargin,
        max_runtime: maxRuntime,
        failure_issue_threshold: 1,
        recovery_threshold: 1,
      },
    },
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Sentry check-in request failed");
  }
  if (!response.ok)
    throw new Error(`Sentry check-in rejected (HTTP ${response.status})`);
}

module.exports = { sendSentryCheckIn };
