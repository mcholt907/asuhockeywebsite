// api.js — thin /api route handlers; all data logic lives in scrapers/services
const express = require("express");
const {
  fetchNewsData,
  fetchScheduleData,
  scrapeCHNStats,
  scrapeNCHCStandings,
  scrapeTransferData,
  scrapeAlumniData,
} = require("../scrapers");
const { getRoster } = require("../services/roster-service");
const { getStaticData } = require("../services/static-data");
const { getDataStatus, getCooldownStatus } = require("../cache/data-status");

const router = express.Router();

// Data freshness status — reports per-dataset age/source so silent
// staleness (broken selectors, dead refresh jobs) is observable.
router.get("/status", (req, res) => {
  try {
    res.json({
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      datasets: getDataStatus(),
      cooldowns: getCooldownStatus(),
    });
  } catch (error) {
    console.error("[API /status] Error building status:", error);
    res
      .status(500)
      .json({ error: "Internal server error while building status." });
  }
});

// News
router.get("/news", async (req, res) => {
  try {
    const articlesArray = await fetchNewsData();

    // Read manual news entries from in-memory static-data cache (mtime-invalidated)
    const manualNews = getStaticData().manual_news || [];

    const combined = [...manualNews, ...articlesArray].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );

    if (combined.length > 0) {
      res.json({
        data: combined,
        source: "api",
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(
        "/api/news: No news data returned from fetchNewsData or an error occurred internally in scraper.",
      );
      res
        .status(500)
        .json({ error: "Failed to fetch news data or no news available." });
    }
  } catch (error) {
    console.error("Error in /api/news endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching news." });
  }
});

// Schedule
router.get("/schedule", async (req, res) => {
  try {
    const { games, team_record } = await fetchScheduleData();

    if (games && games.length > 0) {
      res.json({
        data: games,
        team_record: team_record || null,
        source: "api",
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(
        "/api/schedule: No schedule data returned from fetchScheduleData or an error occurred internally in scraper.",
      );
      res.status(500).json({
        error: "Failed to fetch schedule data or no schedule available.",
      });
    }
  } catch (error) {
    console.error("Error in /api/schedule endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching schedule data." });
  }
});

// Recruiting — reads directly from static JSON (source of truth)
router.get("/recruits", (req, res) => {
  res.json(getStaticData().recruiting || {});
});

// Transfers (incoming/outgoing)
router.get("/transfers", async (req, res) => {
  try {
    console.log("[API /transfers] Fetching transfer data...");
    const transferData = await scrapeTransferData();
    console.log(
      `[API /transfers] Returning ${transferData.incoming?.length || 0} incoming, ${transferData.outgoing?.length || 0} outgoing transfers`,
    );
    res.json(transferData);
  } catch (error) {
    console.error("[API /transfers] Error:", error.message);
    res.status(500).json({
      error: "Failed to fetch transfer data",
      message: error.message,
    });
  }
});

// Alumni (Where Are They Now?)
router.get("/alumni", async (req, res) => {
  try {
    console.log("[API /alumni] Fetching alumni data...");
    const alumniData = await scrapeAlumniData();
    console.log(
      `[API /alumni] Returning ${alumniData.skaters?.length || 0} skaters, ${alumniData.goalies?.length || 0} goalies`,
    );
    res.json(alumniData);
  } catch (error) {
    console.error("[API /alumni] Error:", error.message);
    res.status(500).json({
      error: "Failed to fetch alumni data",
      message: error.message,
    });
  }
});

// Roster
router.get("/roster", async (req, res) => {
  try {
    const roster = await getRoster();
    if (roster.length > 0) {
      res.json(roster);
    } else {
      res.status(404).json({ error: "Roster data not found." });
    }
  } catch (error) {
    console.error("Error in /api/roster:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching roster data." });
  }
});

// Stats
router.get("/stats", async (req, res) => {
  try {
    // scrapeCHNStats handles cache check, SWR, and coalescing internally.
    // Empty skaters/goalies is a valid state (offseason / season not started);
    // a failed scrape throws and is handled below.
    const statsData = await scrapeCHNStats();
    if (
      statsData &&
      Array.isArray(statsData.skaters) &&
      Array.isArray(statsData.goalies)
    ) {
      res.json(statsData);
    } else {
      res.status(500).json({ error: "Failed to fetch stats data." });
    }
  } catch (error) {
    console.error("Error in /api/stats endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching stats." });
  }
});

// NCHC conference standings
router.get("/standings", async (req, res) => {
  try {
    const standings = await scrapeNCHCStandings();
    if (standings && standings.length > 0) {
      res.json({ data: standings, timestamp: new Date().toISOString() });
    } else {
      res.status(500).json({ error: "Failed to fetch standings data." });
    }
  } catch (error) {
    console.error("Error in /api/standings endpoint:", error);
    res
      .status(500)
      .json({ error: "Internal server error while fetching standings." });
  }
});

module.exports = router;
