// index.js — public scraper API
module.exports = {
  ...require("./news"),
  ...require("./schedule"),
  ...require("./stats"),
  ...require("./standings"),
  ...require("./roster"),
  ...require("./transfers"),
  ...require("./alumni"),
  ...require("./recruiting"),
};
