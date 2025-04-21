// scrape.js
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const commandHandler = require("./services/commandHandler");
const config = require("./config");
const loggerService = require("./services/logger");

async function runScraper() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(process.env.DISCORD_TOKEN);

    client.once("ready", async () => {
      loggerService.log(`Scraper logged in as ${client.user.tag}`);

      try {
        await commandHandler.executeCommand(
          "jobseverything",
          {
            linkedinTimeFilter: config.linkedin.timeFilters.day,
            simplyhiredTimeFilter: config.simplyhired.timeFilters.day,
            ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.day,
            careerjetTimeFilter: config.careerjet.timeFilters.day,
            glassdoorTimeFilter: "day",
            diceTimeFilter: config.dice.timeFilters.day,
          },
          client
        );
        loggerService.log("Scrape complete");
      } catch (error) {
        loggerService.log(`Error during scraping: ${error.message}`, "error");
      } finally {
        await client.destroy();
        process.exit(0);
      }
    });
  } catch (error) {
    loggerService.log(`Error starting scraper: ${error.message}`, "error");
    process.exit(1);
  }
}

// Run the scraper
runScraper();
