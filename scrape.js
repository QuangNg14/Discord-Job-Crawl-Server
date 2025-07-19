// scrape.js - Comprehensive job scraping from all sources
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config");
const loggerService = require("./services/logger");
const mongoService = require("./services/mongo");

// Import all scrapers
const linkedinScraper = require("./scrapers/linkedin");
const simplyhiredScraper = require("./scrapers/simplyhired");
const ziprecruiterScraper = require("./scrapers/ziprecruiter");
const careerjetScraper = require("./scrapers/careerjet");
const jobrightScraper = require("./scrapers/jobright");
const glassdoorScraper = require("./scrapers/glassdoor");
const diceScraper = require("./scrapers/dice");
const githubScraper = require("./scrapers/github");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Map of available scrapers for specific source scraping
 */
const availableScrapers = {
  linkedin: {
    name: "LinkedIn",
    scraper: (client) =>
      linkedinScraper.scrapeAllJobs(
        config.linkedin.timeFilters.week,
        client,
        "comprehensive"
      ),
  },
  simplyhired: {
    name: "SimplyHired",
    scraper: (client) =>
      simplyhiredScraper.scrapeAllJobs(
        config.simplyhired.timeFilters.day,
        client,
        "comprehensive"
      ),
  },
  ziprecruiter: {
    name: "ZipRecruiter",
    scraper: (client) =>
      ziprecruiterScraper.scrapeAllJobs(
        config.ziprecruiter.timeFilters.day,
        client,
        "comprehensive"
      ),
  },
  careerjet: {
    name: "CareerJet",
    scraper: (client) =>
      careerjetScraper.scrapeAllJobs(
        config.careerjet.timeFilters.day,
        client,
        "comprehensive"
      ),
  },
  jobright: {
    name: "JobRight",
    scraper: (client) => jobrightScraper.scrapeAllJobs(client, "comprehensive"),
  },
  glassdoor: {
    name: "Glassdoor",
    scraper: (client) =>
      glassdoorScraper.scrapeAllJobs("day", client, "comprehensive"),
  },
  dice: {
    name: "Dice",
    scraper: (client) =>
      diceScraper.scrapeAllJobs(
        config.dice.timeFilters.day,
        client,
        "comprehensive"
      ),
  },
  github: {
    name: "GitHub",
    scraper: (client) => githubScraper.scrapeAllJobs(client, "comprehensive"),
  },
};

/**
 * Run scraping for a specific source
 */
async function runSpecificScraper(sourceName, client) {
  const startTime = new Date();
  const scraper = availableScrapers[sourceName.toLowerCase()];

  if (!scraper) {
    const availableSources = Object.keys(availableScrapers).join(", ");
    loggerService.log(`❌ Unknown scraper source: ${sourceName}`, "error");
    loggerService.log(`Available sources: ${availableSources}`, "info");
    return { success: false, error: `Unknown source: ${sourceName}` };
  }

  loggerService.log(`🚀 Starting ${scraper.name} job scraping...`);

  const channel = client.channels.cache.get(config.channelId);
  if (channel) {
    await channel.send(`🤖 Starting ${scraper.name} job scraping...`);
  }

  try {
    loggerService.log(`🔍 Scraping ${scraper.name}...`);
    await scraper.scraper(client);

    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    const stats = await mongoService.getAllCacheStats();

    loggerService.log(
      `✅ ${scraper.name} completed successfully in ${duration} seconds`
    );

    // Send success message to Discord
    if (channel) {
      const embed = {
        title: `🎯 ${scraper.name} Scraping Complete`,
        description: `Completed in ${duration} seconds`,
        color: 0x00ff00,
        fields: [
          {
            name: "📊 Total jobs in cache",
            value: stats.total.toString(),
            inline: true,
          },
          {
            name: `📈 ${scraper.name} jobs`,
            value: stats[sourceName.toLowerCase()]?.count?.toString() || "0",
            inline: true,
          },
        ],
        footer: {
          text: `Completed at ${endTime.toLocaleString()}`,
        },
      };

      await channel.send({ embeds: [embed] });
    }

    return { success: true, duration, stats };
  } catch (error) {
    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);

    loggerService.log(`❌ ${scraper.name} failed: ${error.message}`, "error");

    // Send error message to Discord
    if (channel) {
      const embed = {
        title: `❌ ${scraper.name} Scraping Failed`,
        description: `Failed after ${duration} seconds`,
        color: 0xff0000,
        fields: [
          {
            name: "Error Details",
            value: error.message,
            inline: false,
          },
        ],
        footer: {
          text: `Failed at ${endTime.toLocaleString()}`,
        },
      };

      await channel.send({ embeds: [embed] });
    }

    return { success: false, error: error.message, duration };
  }
}

/**
 * Display usage information
 */
function showUsage() {
  const availableSources = Object.keys(availableScrapers).join(", ");

  console.log(`
📖 Job Scraper Usage:

🔹 Run comprehensive scraping (all sources):
   node scrape.js

🔹 Run specific source scraping:
   node scrape.js <source_name>

📋 Available sources:
   ${availableSources}

💡 Examples:
   node scrape.js linkedin              # LinkedIn comprehensive (past week focus)
   node scrape.js github                # GitHub repositories
   node scrape.js glassdoor             # Glassdoor jobs
   node scrape.js simplyhired           # SimplyHired jobs
   node scrape.js ziprecruiter          # ZipRecruiter jobs
  `);
}

/**
 * Comprehensive scraping function that runs all job sources
 */
async function runComprehensiveScrape(client) {
  const startTime = new Date();
  loggerService.log(
    "🚀 Starting comprehensive job scraping across all sources..."
  );

  const channel = client.channels.cache.get(config.channelId);
  if (channel) {
    await channel.send(
      "🤖 Starting comprehensive job scraping across all sources..."
    );
  }

  const scrapingTasks = [];
  const results = {
    successful: [],
    failed: [],
    totalJobsFound: 0,
  };

  // Define all scraping tasks with their configurations
  const sourceTasks = [
    {
      name: "LinkedIn",
      scraper: () =>
        linkedinScraper.scrapeAllJobs(
          config.linkedin.timeFilters.week,
          client,
          "comprehensive"
        ),
      priority: 1,
    },
    {
      name: "SimplyHired",
      scraper: () =>
        simplyhiredScraper.scrapeAllJobs(
          config.simplyhired.timeFilters.day,
          client,
          "comprehensive"
        ),
      priority: 2,
    },
    {
      name: "ZipRecruiter",
      scraper: () =>
        ziprecruiterScraper.scrapeAllJobs(
          config.ziprecruiter.timeFilters.day,
          client,
          "comprehensive"
        ),
      priority: 2,
    },
    {
      name: "CareerJet",
      scraper: () =>
        careerjetScraper.scrapeAllJobs(
          config.careerjet.timeFilters.day,
          client,
          "comprehensive"
        ),
      priority: 3,
    },
    {
      name: "JobRight",
      scraper: () => jobrightScraper.scrapeAllJobs(client, "comprehensive"),
      priority: 3,
    },
    {
      name: "Glassdoor",
      scraper: () =>
        glassdoorScraper.scrapeAllJobs("day", client, "comprehensive"),
      priority: 2,
    },
    {
      name: "Dice",
      scraper: () =>
        diceScraper.scrapeAllJobs(
          config.dice.timeFilters.day,
          client,
          "comprehensive"
        ),
      priority: 3,
    },
    {
      name: "GitHub",
      scraper: () => githubScraper.scrapeAllJobs(client, "comprehensive"),
      priority: 1,
    },
  ];

  // Sort tasks by priority (1 = highest priority)
  sourceTasks.sort((a, b) => a.priority - b.priority);

  // Run high-priority sources first (priority 1)
  const highPriorityTasks = sourceTasks.filter((task) => task.priority === 1);
  loggerService.log(
    `Running ${highPriorityTasks.length} high-priority sources first...`
  );

  for (const task of highPriorityTasks) {
    try {
      loggerService.log(`🔍 Scraping ${task.name}...`);
      await task.scraper();
      results.successful.push(task.name);
      loggerService.log(`✅ ${task.name} completed successfully`);
      await delay(2000); // Short delay between sources
    } catch (error) {
      loggerService.log(`❌ ${task.name} failed: ${error.message}`, "error");
      results.failed.push({ name: task.name, error: error.message });
    }
  }

  // Run medium-priority sources (priority 2)
  const mediumPriorityTasks = sourceTasks.filter((task) => task.priority === 2);
  loggerService.log(
    `Running ${mediumPriorityTasks.length} medium-priority sources...`
  );

  for (const task of mediumPriorityTasks) {
    try {
      loggerService.log(`🔍 Scraping ${task.name}...`);
      await task.scraper();
      results.successful.push(task.name);
      loggerService.log(`✅ ${task.name} completed successfully`);
      await delay(3000); // Longer delay for medium priority
    } catch (error) {
      loggerService.log(`❌ ${task.name} failed: ${error.message}`, "error");
      results.failed.push({ name: task.name, error: error.message });
    }
  }

  // Run low-priority sources (priority 3)
  const lowPriorityTasks = sourceTasks.filter((task) => task.priority === 3);
  loggerService.log(
    `Running ${lowPriorityTasks.length} low-priority sources...`
  );

  for (const task of lowPriorityTasks) {
    try {
      loggerService.log(`🔍 Scraping ${task.name}...`);
      await task.scraper();
      results.successful.push(task.name);
      loggerService.log(`✅ ${task.name} completed successfully`);
      await delay(4000); // Longest delay for low priority
    } catch (error) {
      loggerService.log(`❌ ${task.name} failed: ${error.message}`, "error");
      results.failed.push({ name: task.name, error: error.message });
    }
  }

  // Get final statistics
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  const stats = await mongoService.getAllCacheStats();

  loggerService.log(
    `🎉 Comprehensive scraping completed in ${duration} seconds`
  );
  loggerService.log(
    `📊 Results: ${results.successful.length} successful, ${results.failed.length} failed`
  );
  loggerService.log(`📈 Total jobs in cache: ${stats.total}`);

  // Send summary to Discord
  if (channel) {
    const embed = {
      title: "🎯 Comprehensive Job Scraping Complete",
      description: `Scraped ${sourceTasks.length} job sources in ${duration} seconds`,
      color: results.failed.length > 0 ? 0xffa500 : 0x00ff00, // Orange if any failures, green if all success
      fields: [
        {
          name: "✅ Successful Sources",
          value:
            results.successful.length > 0
              ? results.successful.join(", ")
              : "None",
          inline: false,
        },
        {
          name: "❌ Failed Sources",
          value:
            results.failed.length > 0
              ? results.failed.map((f) => f.name).join(", ")
              : "None",
          inline: false,
        },
        {
          name: "📊 Cache Statistics",
          value: `Total jobs: ${stats.total}\nLinkedIn: ${stats.linkedin.count}\nGitHub: ${stats.github.count}`,
          inline: true,
        },
        {
          name: "🏢 Other Sources",
          value: `Glassdoor: ${stats.glassdoor.count}\nDice: ${stats.dice.count}\nSimplyHired: ${stats.simplyhired.count}\nZipRecruiter: ${stats.ziprecruiter.count}`,
          inline: true,
        },
      ],
      footer: {
        text: `Completed at ${endTime.toLocaleString()}`,
      },
    };

    await channel.send({ embeds: [embed] });

    // Send error details if any failures occurred
    if (results.failed.length > 0) {
      const errorDetails = results.failed
        .map((f) => `**${f.name}**: ${f.error}`)
        .join("\n");

      await channel.send(`❌ **Error Details:**\n${errorDetails}`);
    }
  }

  return results;
}

/**
 * Main scraper function
 */
async function runScraper() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle help command
  if (command === "help" || command === "--help" || command === "-h") {
    showUsage();
    process.exit(0);
  }

  // Validate specific scraper if provided
  if (command && !availableScrapers[command.toLowerCase()]) {
    console.log(`❌ Error: Unknown scraper source '${command}'`);
    showUsage();
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(process.env.DISCORD_TOKEN);

    client.once("ready", async () => {
      loggerService.log(`Scraper logged in as ${client.user.tag}`);

      // Connect to MongoDB and load cache
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
        let results;

        if (command) {
          // Run specific scraper
          loggerService.log(`🎯 Running specific scraper: ${command}`);
          results = await runSpecificScraper(command, client);

          if (results.success) {
            loggerService.log(`🎉 ${command} scraping completed successfully`);
          } else {
            loggerService.log(
              `❌ ${command} scraping failed: ${results.error}`,
              "error"
            );
          }
        } else {
          // Run comprehensive scraping (all sources)
          loggerService.log(
            "🚀 No specific source provided, running comprehensive scraping"
          );
          results = await runComprehensiveScrape(client);

          loggerService.log("🎉 All scraping tasks completed");
          loggerService.log(
            `Final results: ${results.successful.length} successful, ${results.failed.length} failed`
          );
        }
      } catch (error) {
        loggerService.log(`Error during scraping: ${error.message}`, "error");
      } finally {
        // Close connections and exit
        await mongoService.close();
        await client.destroy();
        process.exit(0);
      }
    });
  } catch (error) {
    loggerService.log(`Error starting scraper: ${error.message}`, "error");
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  loggerService.log("Received SIGINT, shutting down gracefully...");
  await mongoService.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  loggerService.log("Received SIGTERM, shutting down gracefully...");
  await mongoService.close();
  process.exit(0);
});

// Run the scraper
if (
  process.argv.slice(2).length > 0 &&
  process.argv.slice(2)[0] !== "help" &&
  process.argv.slice(2)[0] !== "--help" &&
  process.argv.slice(2)[0] !== "-h"
) {
  loggerService.log(
    `🎯 Initializing specific scraper for: ${process.argv.slice(2)[0]}...`
  );
} else {
  loggerService.log("🚀 Initializing comprehensive job scraper...");
}
runScraper();
