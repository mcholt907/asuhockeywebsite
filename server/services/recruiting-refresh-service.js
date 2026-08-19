const fs = require("fs");

const SCRAPER_FIELDS = [
  "number",
  "name",
  "position",
  "age",
  "birth_year",
  "birthplace",
  "height",
  "weight",
  "shoots",
  "player_link",
  "player_photo",
  "current_team",
];
const DEFAULT_MAX_DROP_FRACTION = 0.35;

function normalizePlayerUrl(value) {
  const url = new URL(String(value).trim());
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}

function isNonblank(value) {
  return typeof value === "string"
    ? value.trim() !== ""
    : value !== undefined && value !== null;
}

function validateRecruitingSnapshot({
  snapshot,
  existingRecruiting,
  seasons,
  maxDropFraction = DEFAULT_MAX_DROP_FRACTION,
}) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Recruiting snapshot must be an object");
  }
  if (
    !existingRecruiting ||
    typeof existingRecruiting !== "object" ||
    Array.isArray(existingRecruiting)
  ) {
    throw new Error("Existing recruiting data must be an object");
  }
  if (!Array.isArray(seasons) || seasons.length === 0) {
    throw new Error("Recruiting seasons must be a nonempty array");
  }

  let scrapedCount = 0;
  let existingCount = 0;

  for (const season of seasons) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, season)) {
      throw new Error(
        `Recruiting snapshot is missing configured season ${season}`,
      );
    }
    if (!Array.isArray(snapshot[season])) {
      throw new Error(`Recruiting snapshot season ${season} must be an array`);
    }
    const hasExistingSeason = Object.prototype.hasOwnProperty.call(
      existingRecruiting,
      season,
    );
    const existingPlayers = hasExistingSeason ? existingRecruiting[season] : [];
    if (!Array.isArray(existingPlayers)) {
      throw new Error(`Existing recruiting season ${season} must be an array`);
    }

    const seenUrls = new Set();
    for (const recruit of snapshot[season]) {
      if (!recruit || typeof recruit !== "object" || Array.isArray(recruit)) {
        throw new Error(
          `Recruiting snapshot season ${season} contains an invalid player`,
        );
      }
      for (const field of ["name", "position", "player_link"]) {
        if (!isNonblank(recruit[field])) {
          throw new Error(
            `Recruiting snapshot player in ${season} is missing ${field}`,
          );
        }
      }
      let identity;
      try {
        identity = normalizePlayerUrl(recruit.player_link);
      } catch {
        throw new Error(
          `Recruiting snapshot player in ${season} has an invalid player_link`,
        );
      }
      if (seenUrls.has(identity)) {
        throw new Error(
          `Recruiting snapshot season ${season} has duplicate player_link`,
        );
      }
      seenUrls.add(identity);
    }

    if (existingPlayers.length > 0 && snapshot[season].length === 0) {
      throw new Error(
        `Recruiting snapshot season ${season} unexpectedly became empty`,
      );
    }
    scrapedCount += snapshot[season].length;
    existingCount += existingPlayers.length;
  }

  if (scrapedCount === 0) {
    throw new Error("Recruiting snapshot contains no players");
  }

  const dropFraction =
    existingCount === 0 ? 0 : (existingCount - scrapedCount) / existingCount;
  if (dropFraction > maxDropFraction) {
    throw new Error(
      `Recruiting count dropped ${(dropFraction * 100).toFixed(1)}%; limit is ${maxDropFraction * 100}%`,
    );
  }
}

function emptyRemovalState() {
  return { version: 1, misses: {} };
}

function sortByLastName(left, right) {
  const nameFor = (player) => String(player.name || "").trim();
  const lastNameFor = (player) => {
    const parts = nameFor(player).split(/\s+/);
    return parts[parts.length - 1].toLowerCase();
  };
  const lastNameOrder = lastNameFor(left).localeCompare(lastNameFor(right));
  const fullNameOrder = nameFor(left)
    .toLowerCase()
    .localeCompare(nameFor(right).toLowerCase());
  return (
    lastNameOrder ||
    fullNameOrder ||
    normalizePlayerUrl(left.player_link).localeCompare(
      normalizePlayerUrl(right.player_link),
    )
  );
}

function recordsDiffer(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key) => left[key] !== right[key])
  );
}

function mergeRecruitingSnapshot({
  sourceDocument,
  snapshot,
  removalState,
  seasons,
}) {
  const sourceRecruiting = sourceDocument.recruiting || {};
  const nextRecruiting = { ...sourceRecruiting };
  const priorMisses = removalState?.misses || {};
  const nextMisses = {};
  const summary = { added: 0, updated: 0, retained: 0, removed: 0 };

  for (const season of seasons) {
    const scrapedPlayers = snapshot[season] || [];
    const existingPlayers = sourceRecruiting[season] || [];
    const scrapedByUrl = new Map(
      scrapedPlayers.map((player) => [
        normalizePlayerUrl(player.player_link),
        player,
      ]),
    );
    const nextSeason = [];

    for (const existingPlayer of existingPlayers) {
      const identity = normalizePlayerUrl(existingPlayer.player_link);
      const missKey = `${season}|${identity}`;
      const scrapedPlayer = scrapedByUrl.get(identity);

      if (!scrapedPlayer) {
        if (priorMisses[missKey] === 1) {
          summary.removed += 1;
          continue;
        }
        nextMisses[missKey] = 1;
        summary.retained += 1;
        nextSeason.push({ ...existingPlayer });
        continue;
      }

      const mergedPlayer = { ...existingPlayer };
      for (const field of SCRAPER_FIELDS) {
        if (isNonblank(scrapedPlayer[field]))
          mergedPlayer[field] = scrapedPlayer[field];
      }
      if (recordsDiffer(existingPlayer, mergedPlayer)) summary.updated += 1;
      nextSeason.push(mergedPlayer);
      scrapedByUrl.delete(identity);
    }

    for (const scrapedPlayer of scrapedByUrl.values()) {
      nextSeason.push({ ...scrapedPlayer });
      summary.added += 1;
    }

    nextRecruiting[season] = nextSeason.sort(sortByLastName);
  }

  return {
    document: { ...sourceDocument, recruiting: nextRecruiting },
    removalState: { version: 1, misses: nextMisses },
    summary,
  };
}

function writeRecruitingFilesAtomically({
  dataFile,
  stateFile,
  document,
  removalState,
  fsAdapter = fs,
}) {
  const dataJson = JSON.stringify(document, null, 2);
  const stateJson = JSON.stringify(removalState, null, 2);
  JSON.parse(dataJson);
  JSON.parse(stateJson);

  const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dataTemp = `${dataFile}.tmp-${uniqueSuffix}`;
  const stateTemp = `${stateFile}.tmp-${uniqueSuffix}`;
  const dataBackup = `${dataFile}.bak-${uniqueSuffix}`;
  const stateBackup = `${stateFile}.bak-${uniqueSuffix}`;
  const hadDataFile = fsAdapter.existsSync(dataFile);
  const hadStateFile = fsAdapter.existsSync(stateFile);
  let dataReplaced = false;
  let stateReplaced = false;

  const removeIfPresent = (file) => {
    if (fsAdapter.existsSync(file)) fsAdapter.unlinkSync(file);
  };

  try {
    fsAdapter.writeFileSync(dataTemp, `${dataJson}\n`);
    fsAdapter.writeFileSync(stateTemp, `${stateJson}\n`);
    if (hadDataFile) fsAdapter.copyFileSync(dataFile, dataBackup);
    if (hadStateFile) fsAdapter.copyFileSync(stateFile, stateBackup);

    fsAdapter.renameSync(dataTemp, dataFile);
    dataReplaced = true;
    fsAdapter.renameSync(stateTemp, stateFile);
    stateReplaced = true;
  } catch (error) {
    try {
      if (dataReplaced) {
        if (hadDataFile) fsAdapter.copyFileSync(dataBackup, dataFile);
        else removeIfPresent(dataFile);
      }
      if (stateReplaced) {
        if (hadStateFile) fsAdapter.copyFileSync(stateBackup, stateFile);
        else removeIfPresent(stateFile);
      }
    } finally {
      removeIfPresent(dataTemp);
      removeIfPresent(stateTemp);
      removeIfPresent(dataBackup);
      removeIfPresent(stateBackup);
    }
    throw error;
  }

  removeIfPresent(dataBackup);
  removeIfPresent(stateBackup);
}

module.exports = {
  emptyRemovalState,
  mergeRecruitingSnapshot,
  normalizePlayerUrl,
  validateRecruitingSnapshot,
  writeRecruitingFilesAtomically,
};
