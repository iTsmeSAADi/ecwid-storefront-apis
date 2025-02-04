const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"), // Stores browsers locally
  chrome: {
    skipDownload: false, // Ensures Chrome is downloaded
  },
};
