// Test file for scraper.js
// Run with: node scraper.test.js

const { fetchNewsData, fetchScheduleData, scrapeCHNStats } = require('./scraper');

(async () => {
  console.log("--- Testing fetchScheduleData ---");
  try {
    const schedule = await fetchScheduleData();
    if (schedule && schedule.length > 0) {
      console.log(`Fetched a total of ${schedule.length} games.`);
      console.log('Sample games (first 2):', JSON.stringify(schedule.slice(0, 2), null, 2));
      console.log("Schedule data fetching process complete.");
    } else {
      console.log("No schedule data fetched or an error occurred, returned empty array.");
    }
  } catch (e) {
    console.error("Error during fetchScheduleData test run:", e.message);
  }

  console.log("\n--- Testing fetchNewsData ---");
  try {
    const news = await fetchNewsData();
    if (news && news.length > 0) {
      console.log(`Fetched a total of ${news.length} news articles.`);
      console.log('Sample news (first 2):', JSON.stringify(news.slice(0, 2), null, 2));
      console.log("News data fetching process complete.");
    } else {
      console.log("No news data fetched or an error occurred, returned empty array.");
    }
  } catch (e) {
    console.error("Error during fetchNewsData test run:", e.message);
  }

  console.log("\n--- Testing scrapeCHNStats ---");
  try {
    const stats = await scrapeCHNStats();
    if (stats && (stats.skaters.length > 0 || stats.goalies.length > 0)) {
      console.log(`Fetched stats: ${stats.skaters.length} skaters, ${stats.goalies.length} goalies.`);
      console.log("Stats data fetching process complete.");
    } else {
      console.log("No stats data fetched or an error occurred.");
    }
  } catch (e) {
    console.error("Error during scrapeCHNStats test run:", e.message);
  }
})();

