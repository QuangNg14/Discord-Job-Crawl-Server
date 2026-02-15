require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const loggerService = require("./services/logger");
const mongoService = require("./services/mongo");
const { runComprehensiveScrape } = require("./scrape");

/**
 * Run the daily comprehensive scrape.
 * @param {object} client - Discord client
 * @returns {Promise<object>} scrape results
 */
async function runDailyComprehensiveScrape(client) {
  return runComprehensiveScrape(client);
}

async function runDailyScraper() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(process.env.DISCORD_TOKEN);

    client.once("ready", async () => {
      loggerService.log(`Daily scraper logged in as ${client.user.tag}`);

      const mongoConnected = await mongoService.connect();
      if (!mongoConnected) {
        loggerService.log(
          "MongoDB connection failed, falling back to file cache",
          "error"
        );
      }

      await mongoService.loadCache();
      loggerService.log("Job cache loaded successfully");

      try {
        await runDailyComprehensiveScrape(client);
        loggerService.log("🎉 Daily comprehensive scrape completed");
      } catch (error) {
        loggerService.log(`Daily scrape failed: ${error.message}`, "error");
      } finally {
        await mongoService.close();
        await client.destroy();
        process.exit(0);
      }
    });
  } catch (error) {
    loggerService.log(`Error starting daily scraper: ${error.message}`, "error");
    process.exit(1);
  }
}

module.exports = {
  runDailyComprehensiveScrape,
};

if (require.main === module) {
  runDailyScraper();
}
