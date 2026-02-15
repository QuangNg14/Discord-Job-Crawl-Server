/**
 * Utility script to clear all MongoDB job caches for a fresh test run.
 * Usage: node clear-cache.js
 */
require("dotenv").config();
const mongoService = require("./services/mongo");
const logger = require("./services/logger");

async function main() {
  logger.log("Connecting to MongoDB...");
  const connected = await mongoService.connect();
  if (!connected) {
    logger.log("Failed to connect to MongoDB", "error");
    process.exit(1);
  }

  logger.log("Clearing all job caches...");
  await mongoService.clearAllCaches();
  logger.log("✅ All caches cleared. You can now run a fresh daily scrape.");

  await mongoService.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
