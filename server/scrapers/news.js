// news.js — news aggregation (thesundevils.com website-api + CHN HTML)
const cheerio = require("cheerio");
const config = require("../../config/scraper-config");
const {
  requestWithRetry,
  delayBetweenRequests,
} = require("../lib/request-helper");
const { createCachedScraper } = require("./create-cached-scraper");

// thesundevils.com runs on the WMT Digital / Nuxt platform, which serves all
// page data from a public JSON API under /website-api/. News reads that API
// instead of scraping HTML selectors, which broke on template changes
// (see docs/plans/2026-07-09-sundevils-website-api-migration.md).

const JSON_REQUEST_OPTIONS = { headers: { Accept: "application/json" } };

// Axios parses JSON responses automatically, but the Puppeteer 403-fallback
// path returns raw text — normalize both.
function asJson(data) {
  return typeof data === "string" ? JSON.parse(data) : data;
}

// "2026-06-01T05:05:00.000000Z" → "June 01, 2026" — the display format the old
// HTML scrape produced. News.jsx renders this string raw, and the news sort
// does new Date(date), which parses it.
function formatArticleDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

async function scrapeSunDevilsNewsList() {
  const url = config.urls.sunDevilsArticles;
  console.log(`[Sun Devils News] Fetching articles API: ${url}`);
  try {
    const { data } = await requestWithRetry(url, JSON_REQUEST_OPTIONS);
    const items = asJson(data).data || [];
    const articles = [];

    for (const item of items) {
      const title = String(item.title || "").trim();
      const link = item.permalink;
      const date = formatArticleDate(item.published_at);
      if (title && link && date) {
        articles.push({ title, link, date, source: "TheSunDevils.com" });
      }
    }

    console.log(`[Sun Devils News] Scraped ${articles.length} articles.`);
    return articles;
  } catch (error) {
    console.error("[Sun Devils News] Error fetching articles:", error.message);
    return [];
  }
}

async function scrapeCHN() {
  const url = config.urls.chnNews;
  console.log(`[CHN Scraper] Attempting to fetch CHN news from: ${url}`);
  try {
    const { data } = await requestWithRetry(url);
    console.log("[CHN Scraper] Successfully fetched data from URL.");
    const $ = cheerio.load(data);
    console.log("[CHN Scraper] Cheerio loaded HTML data.");
    const articles = [];
    const listItems = $("div.newslist ul li");
    console.log(
      `[CHN Scraper] Found ${listItems.length} list items with selector 'div.newslist ul li'.`,
    );

    listItems.each((i, element) => {
      const listItem = $(element);
      const linkTag = listItem.find("a");
      const title = linkTag.text().trim();
      let link = linkTag.attr("href");

      let dateText = listItem
        .contents()
        .filter(function () {
          return this.type === "text" && $(this).text().trim() !== "";
        })
        .first()
        .text()
        .trim();
      if (dateText.endsWith("—")) {
        dateText = dateText.slice(0, -1).trim();
      }

      console.log(
        `[CHN Scraper] Processing item ${i + 1}: Title '${title}', Link '${link}', Raw Date '${dateText}'`,
      );

      if (link && !link.startsWith("http")) {
        link = `https://www.collegehockeynews.com${link}`;
      }

      if (title && link && dateText) {
        articles.push({
          title,
          link,
          date: dateText || "Date not found",
          source: "CollegeHockeyNews.com",
        });
      } else {
        console.log(
          `[CHN Scraper] Skipping item ${i + 1} due to missing title, link, or date. Title: '${title}', Link: '${link}', Date: '${dateText}'`,
        );
      }
    });
    console.log(
      `[CHN Scraper] Successfully scraped ${articles.length} articles from CollegeHockeyNews.com`,
    );
    return articles;
  } catch (error) {
    console.error(
      "[CHN Scraper] Error scraping CollegeHockeyNews.com:",
      error.message,
    );
    if (error.response) {
      console.error("[CHN Scraper] Response status:", error.response.status);
    }
    return [];
  }
}

function dedupeArticles(articles) {
  if (articles.length === 0) return articles;
  const uniqueArticles = [];
  const seenLinks = new Set();
  for (const article of articles) {
    if (article.link && !seenLinks.has(article.link)) {
      uniqueArticles.push(article);
      seenLinks.add(article.link);
    } else if (!article.link && article.title) {
      const key = `title:${article.title}`;
      if (!seenLinks.has(key)) {
        uniqueArticles.push(article);
        seenLinks.add(key);
      }
    } else if (!article.link && !article.title) {
      uniqueArticles.push(article);
    }
  }
  return uniqueArticles;
}

function sortArticles(articles) {
  articles.sort((a, b) => {
    let dateA = null,
      dateB = null;
    try {
      if (a.date && a.date !== "Date not found") dateA = new Date(a.date);
    } catch (e) {
      /* ignore */
    }
    try {
      if (b.date && b.date !== "Date not found") dateB = new Date(b.date);
    } catch (e) {
      /* ignore */
    }

    if (dateA && dateB && !isNaN(dateA) && !isNaN(dateB)) {
      return dateB - dateA;
    } else if (dateA && !isNaN(dateA)) {
      return -1;
    } else if (dateB && !isNaN(dateB)) {
      return 1;
    }
    if (a.source && b.source) {
      if (a.source < b.source) return -1;
      if (a.source > b.source) return 1;
    }
    if (a.title && b.title) {
      if (a.title < b.title) return -1;
      if (a.title > b.title) return 1;
    }
    return 0;
  });
}

async function scrapeAllNews() {
  const sunDevilsArticles = await scrapeSunDevilsNewsList();
  await delayBetweenRequests();
  const chnArticles = await scrapeCHN();
  const allArticles = dedupeArticles([...sunDevilsArticles, ...chnArticles]);
  sortArticles(allArticles);
  return allArticles;
}

const fetchNews = createCachedScraper({
  name: "news",
  cacheKey: "asu_hockey_news",
  ttl: config.cache.news,
  scrape: scrapeAllNews,
  validate: (articles) => articles.length > 0,
  // Older cache entries may be the raw array or a {data: []} wrapper.
  normalizeCached: (cached) =>
    Array.isArray(cached) ? cached : cached.data || [],
  onScrapeError: () => [],
});

async function fetchNewsData() {
  return fetchNews();
}

module.exports = { fetchNewsData, scrapeSunDevilsNewsList, scrapeCHN };
