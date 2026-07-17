// index.js — public scraper API
module.exports = {
  ...require("./news"),
  ...require("./schedule"),
  ...require("./stats"),
  ...require("./standings"),
  ...require("./roster"),
};
