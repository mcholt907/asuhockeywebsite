// transfers.js — EliteProspects transfer feed (fallback-only in production:
// EP 403s cloud IPs; bundled JSON refreshed weekly via scripts/refresh-and-push.cmd)
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { reportScrapeHealth } = require("../cache/scrape-health");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

const TRANSFERS_URL =
  "https://www.eliteprospects.com/team/18066/arizona-state-univ/transfers";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms
const FALLBACK_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "asu_transfers_fallback.json",
);

// Memoized by mtime: fallback-only mode serves this on every production
// request, so re-parse only when the weekly refresh rewrites the file.
let fallbackCache = { mtimeMs: 0, value: null };

function getFallbackTransferData() {
  try {
    const stat = fs.statSync(FALLBACK_FILE);
    if (fallbackCache.value && stat.mtimeMs === fallbackCache.mtimeMs) {
      return fallbackCache.value;
    }
    const fallback = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf8"));
    if (
      fallback &&
      Array.isArray(fallback.incoming) &&
      Array.isArray(fallback.outgoing)
    ) {
      fallbackCache = { mtimeMs: stat.mtimeMs, value: fallback };
      return fallback;
    }
    console.warn(
      "[Transfer Scraper] Fallback transfer data has an unexpected shape.",
    );
  } catch (error) {
    console.warn(
      `[Transfer Scraper] Fallback transfer data unavailable: ${error.message}`,
    );
  }
  return null;
}

// In production / prerender, skip live scraping and use bundled fallback.
// EliteProspects 403s cloud-host IPs; live scraping only succeeds from a
// residential IP (set TRANSFER_SCRAPE_LIVE=true to override).
function shouldUseFallbackOnly() {
  if (process.env.TRANSFER_SCRAPE_LIVE === "true") {
    return false;
  }
  return (
    process.env.NODE_ENV === "production" || process.env.IS_PRERENDER === "true"
  );
}

/**
 * Extract player ID from Elite Prospects URL
 */
function extractPlayerId(url) {
  const match = url.match(/\/player\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Extract date from transfer detail URL (format: /transfer/2026/01/15/...)
 */
function extractDateFromUrl(url) {
  if (!url) return "";
  const dateMatch = url.match(/\/transfer\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }
  return "";
}

/**
 * Parse a transfer table row
 */
function parseTransferRow($, $row, direction, incoming, outgoing) {
  const playerLink = $row.find('a[href*="/player/"]').first();
  const teamLink = $row.find('a[href*="/team/"]').first();
  const detailLink = $row.find('a[href*="/transfer/"]').first();

  if (!playerLink.length) return;

  const playerText = playerLink.text().trim();
  const positionMatch = playerText.match(/\(([DFG])\)$/);
  const position = positionMatch ? positionMatch[1] : "";
  const cleanName = playerText.replace(/\s*\([DFG]\)$/, "").trim();

  const playerUrl = playerLink.attr("href") || "";
  const teamName = teamLink.length ? teamLink.text().trim() : "";
  const teamUrl = teamLink.length ? teamLink.attr("href") || "" : "";
  const detailUrl = detailLink.length ? detailLink.attr("href") || "" : "";

  const entry = {
    playerName: cleanName,
    position,
    playerUrl: playerUrl.startsWith("http")
      ? playerUrl
      : `https://www.eliteprospects.com${playerUrl}`,
    playerId: extractPlayerId(playerUrl),
    team: teamName,
    teamUrl: teamUrl.startsWith("http")
      ? teamUrl
      : teamUrl
        ? `https://www.eliteprospects.com${teamUrl}`
        : "",
    transferDate: extractDateFromUrl(detailUrl),
    direction,
  };

  const targetArray = direction === "incoming" ? incoming : outgoing;
  const exists = targetArray.some((p) => p.playerId === entry.playerId);
  if (!exists && entry.playerName) {
    targetArray.push(entry);
  }
}

/**
 * Live scrape of the Elite Prospects transfers page.
 * @returns {Promise<Object>} Object with incoming and outgoing transfers
 */
async function scrapeTransfersLive() {
  console.log(`[Transfer Scraper] Fetching ${TRANSFERS_URL}`);
  const { data: html } = await requestWithRetry(TRANSFERS_URL);
  const $ = cheerio.load(html);

  const incoming = [];
  const outgoing = [];

  // The page has tables for "Joining" and "Leaving" sections
  // Each section has a header and a table with player data

  // Find all section containers with headers
  $(
    'section, div.transaction-section, div[class*="TransferSection"], div[class*="transfer"]',
  ).each((i, section) => {
    const $section = $(section);
    const sectionText = $section.text().toLowerCase();

    // Determine direction from section header
    let direction = "";
    if (sectionText.includes("joining") || sectionText.includes("incoming")) {
      direction = "incoming";
    } else if (
      sectionText.includes("leaving") ||
      sectionText.includes("outgoing")
    ) {
      direction = "outgoing";
    }

    if (!direction) return;

    // Find table rows in this section
    $section.find("tr").each((j, row) => {
      const $row = $(row);
      parseTransferRow($, $row, direction, incoming, outgoing);
    });
  });

  // Alternative: Parse by looking for table elements directly
  // EP uses tables with class patterns like TransferTable
  $("table").each((i, table) => {
    const $table = $(table);
    const $prevHeader = $table.prevAll('h2, h3, [class*="Header"]').first();
    const headerText = $prevHeader.text().toLowerCase();

    let direction = "";
    if (headerText.includes("joining")) {
      direction = "incoming";
    } else if (headerText.includes("leaving")) {
      direction = "outgoing";
    }

    if (!direction) return;

    $table.find("tr").each((j, row) => {
      const $row = $(row);
      parseTransferRow($, $row, direction, incoming, outgoing);
    });
  });

  // Fallback: walk headers and player/team/transfer links in document order,
  // pairing each player with the team and detail link that follow it.
  let currentSection = "unknown";
  const elements = $(
    'h2, h3, a[href*="/player/"], a[href*="/team/"], a[href*="/transfer/"]',
  );

  let lastPlayer = null;
  let lastTeam = null;

  elements.each((i, el) => {
    const $el = $(el);
    const tagName = el.tagName?.toLowerCase();
    const href = $el.attr("href") || "";
    const text = $el.text().trim();

    // Track section headers
    if (tagName === "h2" || tagName === "h3") {
      const headerText = text.toLowerCase();
      if (headerText.includes("joining")) {
        currentSection = "incoming";
      } else if (headerText.includes("leaving")) {
        currentSection = "outgoing";
      } else if (
        headerText.includes("recalled") ||
        headerText.includes("reassigned")
      ) {
        currentSection = "skip"; // Skip this section
      }
      return;
    }

    if (currentSection === "skip" || currentSection === "unknown") return;

    // Found a player link
    if (href.includes("/player/")) {
      // If we had a previous player without team, add them anyway
      if (lastPlayer && !lastPlayer.team && lastTeam) {
        lastPlayer.team = lastTeam.name;
        lastPlayer.teamUrl = lastTeam.url;
      }

      // Extract position from text like "Jonas Woo (D)"
      const positionMatch = text.match(/\(([DFG])\)$/);
      const position = positionMatch ? positionMatch[1] : "";
      const cleanName = text.replace(/\s*\([DFG]\)$/, "").trim();

      lastPlayer = {
        playerName: cleanName,
        position,
        playerUrl: href.startsWith("http")
          ? href
          : `https://www.eliteprospects.com${href}`,
        playerId: extractPlayerId(href),
        team: "",
        teamUrl: "",
        transferDate: "",
        direction: currentSection,
      };
      lastTeam = null;
    }
    // Found a team link (next after player)
    else if (href.includes("/team/") && lastPlayer && !lastPlayer.team) {
      lastTeam = {
        name: text,
        url: href.startsWith("http")
          ? href
          : `https://www.eliteprospects.com${href}`,
      };
      lastPlayer.team = lastTeam.name;
      lastPlayer.teamUrl = lastTeam.url;
    }
    // Found a detail link (extract date)
    else if (href.includes("/transfer/") && lastPlayer) {
      lastPlayer.transferDate = extractDateFromUrl(href);

      // Now we have complete data, add the player
      const targetArray =
        lastPlayer.direction === "incoming" ? incoming : outgoing;

      // Check if already added
      const exists = targetArray.some(
        (p) => p.playerId === lastPlayer.playerId,
      );
      if (!exists) {
        targetArray.push({ ...lastPlayer });
      }

      lastPlayer = null;
      lastTeam = null;
    }
  });

  const result = {
    incoming,
    outgoing,
    lastUpdated: new Date().toISOString(),
  };

  console.log(
    `[Transfer Scraper] Found ${incoming.length} incoming, ${outgoing.length} outgoing transfers`,
  );

  // Log details for debugging
  incoming.forEach((t) =>
    console.log(`  [JOINING] ${t.playerName} (${t.position}) from ${t.team}`),
  );
  outgoing.forEach((t) =>
    console.log(`  [LEAVING] ${t.playerName} (${t.position}) to ${t.team}`),
  );

  return result;
}

const fetchTransfers = createCachedScraper({
  name: "transfers",
  cacheKey: "asu_transfers",
  ttl: CACHE_TTL,
  swr: false, // EP scrapers never served stale pre-scrape; stale is error recovery only
  scrape: scrapeTransfersLive,
  // Selector-health guard: only flag when BOTH directions are empty —
  // one direction empty during a quiet period is normal.
  validate: (result) =>
    reportScrapeHealth("transfers", {
      totalTransfers: result.incoming.length + result.outgoing.length,
    }),
  fallback: getFallbackTransferData,
  fallbackOnly: shouldUseFallbackOnly,
  onScrapeError: () => ({ incoming: [], outgoing: [], lastUpdated: null }),
});

async function scrapeTransferData() {
  return fetchTransfers();
}

module.exports = { scrapeTransferData };
