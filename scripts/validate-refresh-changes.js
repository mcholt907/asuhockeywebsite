const ALLOWED_REFRESH_PATHS = new Set([
  "asu_hockey_data.json",
  "data/asu_recruiting_refresh_state.json",
  "data/asu_alumni_fallback.json",
  "data/asu_transfers_fallback.json",
]);

function validateRefreshChanges(paths) {
  const normalizedPaths = paths.map((filePath) =>
    String(filePath).replace(/\\/g, "/"),
  );
  const unexpectedPaths = normalizedPaths.filter(
    (filePath) => !ALLOWED_REFRESH_PATHS.has(filePath),
  );

  if (unexpectedPaths.length > 0) {
    const noun = unexpectedPaths.length === 1 ? "path" : "paths";
    throw new Error(
      `Refresh automation rejected unexpected ${noun}: ${unexpectedPaths.join(", ")}`,
    );
  }

  return normalizedPaths;
}

if (require.main === module) {
  try {
    const validatedPaths = validateRefreshChanges(process.argv.slice(2));
    console.log(
      `[refresh-allowlist] validated ${validatedPaths.length} changed path(s)`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateRefreshChanges };
