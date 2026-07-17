// roster.js — CHN roster scrape (merged with static data by roster-service)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const { requestWithRetry } = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

async function scrapeRoster() {
  const url = config.urls.chnRoster;
  console.log(`[CHN Roster Scraper] Attempting to fetch roster from: ${url}`);
  const { data } = await requestWithRetry(url);
  const $ = cheerio.load(data);
  const players = [];

  $("table").each((i, table) => {
    const headers = [];
    $(table)
      .find("thead th")
      .each((j, th) => {
        const text = $(th).text().trim();
        headers.push(text);
      });

    // Heuristic: Check if headers contain "Name" or "Player"
    const hasName = headers.some(
      (h) => h.includes("Name") || h.includes("Player"),
    );

    if (hasName) {
      $(table)
        .find("tbody tr")
        .each((j, tr) => {
          const cells = $(tr).find("td");
          // Skip section headers (e.g. "Defensemen", "2026") which usually have 1-2 cells
          if (cells.length < 5) return;

          const row = {};
          cells.each((k, td) => {
            const header = headers[k] || `col_${k}`;
            row[header] = $(td).text().trim();
          });

          // Normalize keys
          let nameVal = row["Name"] || row["Player"];

          // Handle "Last, First" format if present
          if (nameVal && nameVal.includes(",")) {
            const parts = nameVal.split(",").map((s) => s.trim());
            if (parts.length === 2) {
              nameVal = `${parts[1]} ${parts[0]}`; // First Last
            }
          }

          if (nameVal) {
            // Clean trailing chars
            nameVal = nameVal.replace(/\s*\(\w+\)$/, "").trim();

            const playerObj = {
              Player: nameVal,
              "#": row["No."] || row["#"] || "",
              Pos: row["Pos"] || row["Pos."] || row["Position"] || "",
              "S/C": row["S/C"] || row["S"] || row["Shoots"] || "",
              Ht: row["Ht."] || row["Height"] || row["Ht"] || "-",
              Wt: row["Wt."] || row["Weight"] || row["Wt"] || "-",
              DOB: row["DOB"] || row["Born"] || "-",
              Hometown: row["Hometown"] || row["Birthplace"] || "-",
            };
            players.push(playerObj);
          }
        });
    }
  });

  console.log(`[CHN Roster Scraper] Scraped ${players.length} players.`);
  return players;
}

const fetchRoster = createCachedScraper({
  name: "roster",
  cacheKey: "asu_hockey_roster",
  ttl: config.cache.roster,
  scrape: scrapeRoster,
  validate: (players) => players.length > 0,
  onScrapeError: () => [],
});

async function scrapeCHNRoster() {
  return fetchRoster();
}

module.exports = { scrapeCHNRoster };
