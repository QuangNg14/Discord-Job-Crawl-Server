// scrape.js - Comprehensive job scraping from all sources with optimization
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config");
const loggerService = require("./services/logger");
const mongoService = require("./services/mongo");
const { 
  deduplicateJobs, 
  createDiscordJobMessages, 
  createDailySummaryMessage,
  createSourceSummaryMessages,
  sendSourceSummaryToDiscord,
  filterRelevantJobs,
  normalizeJob,
  generateJobId
} = require("./utils/helpers");

// Import all scrapers
const linkedinScraper = require("./scrapers/linkedin");
const ziprecruiterScraper = require("./scrapers/ziprecruiter");
const jobrightScraper = require("./scrapers/jobright");
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
  ziprecruiter: {
    name: "ZipRecruiter",
    scraper: (client) =>
      ziprecruiterScraper.scrapeAllJobs(
        config.ziprecruiter.timeFilters.day,
        client,
        "comprehensive"
      ),
  },
  jobright: {
    name: "JobRight",
    scraper: (client) => jobrightScraper.scrapeAllJobs(client, "comprehensive"),
  },
  github: {
    name: "GitHub",
    scraper: (client) =>
      githubScraper.scrapeAllJobs(client, "comprehensive", "intern"),
  },
};

/**
 * Check if we should skip scraping a source based on recent activity
 * @param {string} sourceName - Name of the source
 * @returns {Object} Skip decision and reason
 */
async function shouldSkipSource(sourceName) {
  const optimization = config.dailyScraping.optimization;
  
  if (!optimization.enabled || !optimization.intelligentSkipping) {
    return { shouldSkip: false, reason: "Optimization disabled" };
  }

  try {
    const skipResult = await mongoService.shouldSkipSource(sourceName, optimization.cacheTimeRange);
    return skipResult;
  } catch (error) {
    loggerService.log(`Error checking skip status for ${sourceName}: ${error.message}`, "error");
    return { shouldSkip: false, reason: "Error occurred" };
  }
}

/**
 * Get existing jobs from cache for a source
 * @param {string} sourceName - Name of the source
 * @param {string} timeRange - Time range to look back
 * @returns {Array} Array of existing jobs
 */
async function getExistingJobs(sourceName, timeRange = "day") {
  try {
    const existingJobs = await mongoService.getRecentJobs(sourceName, timeRange);
    loggerService.log(`📋 Found ${existingJobs.length} existing jobs for ${sourceName} (${timeRange})`);
    return existingJobs;
  } catch (error) {
    loggerService.log(`Error getting existing jobs for ${sourceName}: ${error.message}`, "error");
    return [];
  }
}

/**
 * Collect jobs from a scraper with intelligent caching and send individual summaries
 * @param {Function} scraperFunction - The scraper function to call
 * @param {string} sourceName - Name of the source
 * @param {object} channel - Discord channel for sending summaries
 * @param {string} priority - Priority level of the source
 * @param {string} role - Role type (intern, new_grad, or both)
 * @returns {Object} Object with jobs and metadata
 */
async function collectJobsFromSource(scraperFunction, sourceName, channel, priority, role = "both") {
  const optimization = config.dailyScraping.optimization;
  const startTime = Date.now();
  
  try {
    loggerService.log(`🔍 Collecting jobs from ${sourceName} for role: ${role}...`);
    
    // Check if we should skip this source
    const skipDecision = await shouldSkipSource(sourceName);
    if (skipDecision.shouldSkip) {
      loggerService.log(`⏭️ Skipping ${sourceName}: ${skipDecision.reason}`);
      
      // Get existing jobs if we're reusing them
      let existingJobs = [];
      if (optimization.reuseExistingJobs) {
        existingJobs = await getExistingJobs(sourceName, optimization.cacheTimeRange);
        loggerService.log(`📋 Reusing ${existingJobs.length} existing jobs from ${sourceName}`);
      }
      
      // Send skip notification to Discord
      if (channel) {
        await sendSourceSummaryToDiscord(channel, sourceName, existingJobs, {
          skipped: true,
          reason: skipDecision.reason,
          priority: priority,
          role: role,
          duration: Date.now() - startTime
        }, delay);
      }
      
      return {
        jobs: existingJobs,
        jobsFound: existingJobs.length,
        skipped: true,
        reason: skipDecision.reason,
        duration: Date.now() - startTime
      };
    }
    
    // Create a mock client for job collection
    const mockClient = {
      channels: {
        cache: {
          get: () => null // Don't send messages during collection
        }
      }
    };

    // Call the scraper function with the specified role
    const result = await scraperFunction(mockClient, role);
    
    if (result && result.jobsFound > 0) {
      loggerService.log(`✅ Collected ${result.jobsFound} jobs from ${sourceName} (${role}) in ${Date.now() - startTime}ms`);
      
      // Send individual source summary to Discord
      if (channel) {
        await sendSourceSummaryToDiscord(channel, sourceName, result.jobs || [], {
          jobsFound: result.jobsFound,
          priority: priority,
          role: role,
          duration: Date.now() - startTime
        }, delay);
      }
      
      return {
        jobs: result.jobs || [],
        jobsFound: result.jobsFound,
        skipped: false,
        reason: "Successfully scraped",
        duration: Date.now() - startTime
      };
    } else {
      loggerService.log(`⚠️ No jobs collected from ${sourceName} (${role}) in ${Date.now() - startTime}ms`);
      
      // Send empty summary to Discord
      if (channel) {
        await sendSourceSummaryToDiscord(channel, sourceName, [], {
          jobsFound: 0,
          priority: priority,
          role: role,
          duration: Date.now() - startTime
        }, delay);
      }
      
      return {
        jobs: [],
        jobsFound: 0,
        skipped: false,
        reason: "No jobs found",
        duration: Date.now() - startTime
      };
    }
  } catch (error) {
    loggerService.log(`❌ Error collecting jobs from ${sourceName} (${role}): ${error.message}`, "error");
    
    // Send error summary to Discord
    if (channel) {
      await sendSourceSummaryToDiscord(channel, sourceName, [], {
        jobsFound: 0,
        priority: priority,
        role: role,
        duration: Date.now() - startTime,
        error: error.message
      }, delay);
    }
    
    return {
      jobs: [],
      jobsFound: 0,
      skipped: false,
      reason: `Error: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Run scrapers in parallel for a given priority level
 * @param {Array} tasks - Array of scraping tasks
 * @param {string} priority - Priority level
 * @param {object} channel - Discord channel for sending summaries
 * @returns {Array} Array of results
 */
async function runParallelScraping(tasks, priority, channel) {
  const optimization = config.dailyScraping.optimization;
  
  if (!optimization.parallelScraping) {
    // Sequential processing
    const results = [];
    for (const task of tasks) {
      const result = await collectJobsFromSource(task.scraper, task.name, channel, priority, task.role);
      results.push({ ...result, name: task.name, priority, role: task.role });
      await delay(2000); // Delay between sources
    }
    return results;
  }
  
  // Parallel processing
  loggerService.log(`🚀 Running ${tasks.length} ${priority}-priority sources in parallel...`);
  
  const promises = tasks.map(async (task) => {
    const result = await collectJobsFromSource(task.scraper, task.name, channel, priority, task.role);
    return { ...result, name: task.name, priority, role: task.role };
  });
  
  const results = await Promise.all(promises);
  loggerService.log(`✅ Completed parallel scraping for ${priority}-priority sources`);
  
  return results;
}

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
    const result = await scraper.scraper(client);

    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    const stats = await mongoService.getAllCacheStats();

    loggerService.log(
      `✅ ${scraper.name} completed successfully in ${duration} seconds`
    );

    // Send individual source summary to Discord
    if (channel && result && result.jobs) {
      await sendSourceSummaryToDiscord(channel, scraper.name, result.jobs, {
        jobsFound: result.jobsFound || 0,
        duration: duration * 1000, // Convert to milliseconds
        priority: "specific"
      }, delay);
    } else if (channel) {
      // Fallback to old format if no jobs data
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
 * Optimized comprehensive scraping function that runs all job sources
 */
async function runComprehensiveScrape(client) {
  const startTime = new Date();
  const dailyConfig = config.dailyScraping;
  const optimization = dailyConfig.optimization;
  
  loggerService.log("🚀 Starting optimized comprehensive job scraping...");
  loggerService.log(`📅 Date: ${startTime.toLocaleDateString()}`);
  loggerService.log(`⏰ Time: ${startTime.toLocaleTimeString()}`);
  loggerService.log(`⚡ Optimization: ${optimization.enabled ? 'Enabled' : 'Disabled'}`);

  const channel = client.channels.cache.get(config.channelId);
  
  // Send start notification
  if (channel) {
    await channel.send({
      embeds: [{
        title: "🤖 Optimized Comprehensive Job Scraping Started",
        description: `Starting intelligent scraping of all job sources for ${startTime.toLocaleDateString()}`,
        color: 0x00ff00,
        fields: [
          {
            name: "📊 Sources",
            value: "LinkedIn, GitHub, ZipRecruiter, JobRight",
            inline: false
          },
          {
            name: "🎯 Job Types",
            value: "Internships & New Graduate/Entry Level",
            inline: false
          },
          {
            name: "⚡ Optimization",
            value: optimization.enabled ? "Enabled" : "Disabled",
            inline: true
          },
          {
            name: "🔄 Parallel Processing",
            value: optimization.parallelScraping ? "Enabled" : "Disabled",
            inline: true
          },
          {
            name: "⏱️ Time Filter",
            value: "Past 24 hours",
            inline: true
          }
        ],
        footer: {
          text: `Started at ${startTime.toLocaleString()}`
        }
      }]
    });
  }

  const results = {
    successful: [],
    failed: [],
    skipped: [],
    totalJobsFound: 0,
    startTime: startTime,
    endTime: null,
    duration: 0,
    optimizationStats: {
      sourcesSkipped: 0,
      sourcesScraped: 0,
      existingJobsReused: 0,
      newJobsFound: 0
    }
  };

  // Define scraping tasks with priority and daily limits - now including both roles
  const sourceTasks = [
    // High Priority Sources - Internships
    {
      name: "LinkedIn (Internships)",
      priority: "high",
      role: "intern",
      scraper: (client, role) => linkedinScraper.scrapeAllJobs(
        config.linkedin.timeFilters.day,
        client,
        "comprehensive",
        role
      ),
      jobLimit: dailyConfig.jobLimits.linkedin
    },
    {
      name: "GitHub (Internships)",
      priority: "high", 
      role: "intern",
      scraper: (client, role) => githubScraper.scrapeAllJobs(
        client,
        "comprehensive",
        role,
        "day"
      ),
      jobLimit: dailyConfig.jobLimits.github
    },
    
    // High Priority Sources - New Graduate/Entry Level
    {
      name: "LinkedIn (New Grad)",
      priority: "high",
      role: "new_grad",
      scraper: (client, role) => linkedinScraper.scrapeAllJobs(
        config.linkedin.timeFilters.day,
        client,
        "comprehensive",
        role
      ),
      jobLimit: dailyConfig.jobLimits.linkedin
    },
    {
      name: "GitHub (New Grad)",
      priority: "high", 
      role: "new_grad",
      scraper: (client, role) => githubScraper.scrapeAllJobs(
        client,
        "comprehensive",
        role,
        "day"
      ),
      jobLimit: dailyConfig.jobLimits.github
    },
    
    // Medium Priority Sources - Internships
    {
      name: "ZipRecruiter (Internships)", 
      priority: "medium",
      role: "intern",
      scraper: (client, role) => ziprecruiterScraper.scrapeAllJobs(
        config.ziprecruiter.timeFilters.day,
        client,
        "comprehensive",
        role
      ),
      jobLimit: dailyConfig.jobLimits.ziprecruiter
    },
    
    // Medium Priority Sources - New Graduate/Entry Level
    {
      name: "ZipRecruiter (New Grad)", 
      priority: "medium",
      role: "new_grad",
      scraper: (client, role) => ziprecruiterScraper.scrapeAllJobs(
        config.ziprecruiter.timeFilters.day,
        client,
        "comprehensive",
        role
      ),
      jobLimit: dailyConfig.jobLimits.ziprecruiter
    },
    
    // Low Priority Sources - Both roles (JobRight handles both internally)
    {
      name: "JobRight",
      priority: "low",
      role: "both",
      scraper: (client, role) => jobrightScraper.scrapeAllJobs(
        client,
        "comprehensive",
        role
      ),
      jobLimit: dailyConfig.jobLimits.jobright
    }
  ];

  // Sort by priority
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  sourceTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  loggerService.log(`📋 Running ${sourceTasks.length} sources with intelligent optimization...`);

  // Collect all jobs from all sources
  const allJobs = [];

  // Process by priority levels
  const priorityLevels = ["high", "medium", "low"];
  
  for (const priority of priorityLevels) {
    const priorityTasks = sourceTasks.filter(task => task.priority === priority);
    
    if (priorityTasks.length === 0) continue;
    
    loggerService.log(`🔥 Processing ${priorityTasks.length} ${priority}-priority sources...`);
    
    // Run scrapers for this priority level
    const priorityResults = await runParallelScraping(priorityTasks, priority, channel);
    
    // Process results
    for (const result of priorityResults) {
      if (result.skipped) {
        results.skipped.push({ 
          name: result.name, 
          priority: result.priority, 
          role: result.role,
          reason: result.reason,
          jobsFound: result.jobsFound 
        });
        results.optimizationStats.sourcesSkipped++;
        results.optimizationStats.existingJobsReused += result.jobsFound;
      } else if (result.jobsFound > 0) {
        results.successful.push({ 
          name: result.name, 
          priority: result.priority, 
          role: result.role,
          jobsFound: result.jobsFound,
          duration: result.duration 
        });
        results.optimizationStats.sourcesScraped++;
        results.optimizationStats.newJobsFound += result.jobsFound;
      } else {
        results.failed.push({ 
          name: result.name, 
          priority: result.priority, 
          role: result.role,
          reason: result.reason 
        });
      }
      
      // Add source information to jobs
      const jobsWithSource = result.jobs.map(job => ({
        ...job,
        source: result.name.toLowerCase(),
        role: result.role
      }));
      
      allJobs.push(...jobsWithSource);
    }
    
    // Small delay between priority levels
    if (priority !== "low") {
      await delay(3000);
    }
  }

  // Process all collected jobs
  loggerService.log(`📊 Processing ${allJobs.length} total jobs from all sources...`);
  
  // Filter for relevant jobs - now include both intern and new grad roles
  const relevantJobs = filterRelevantJobs(allJobs, "both");
  loggerService.log(`✅ Filtered to ${relevantJobs.length} relevant jobs`);
  
  // Deduplicate jobs across all sources
  const uniqueJobs = deduplicateJobs(relevantJobs);
  loggerService.log(`🎯 Found ${uniqueJobs.length} unique jobs after deduplication`);
  
  results.totalJobsFound = uniqueJobs.length;

  // Calculate final statistics
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  const stats = await mongoService.getAllCacheStats();
  
  results.endTime = endTime;
  results.duration = duration;

  loggerService.log(`🎉 Optimized comprehensive scraping completed in ${duration} seconds`);
  loggerService.log(`📊 Results: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`);
  loggerService.log(`📈 Total unique jobs found: ${uniqueJobs.length}`);
  loggerService.log(`⚡ Optimization: ${results.optimizationStats.sourcesSkipped} sources skipped, ${results.optimizationStats.existingJobsReused} existing jobs reused`);

  // Send final completion summary
  if (channel) {
    // Send final summary messages (may be multiple if too long)
    const summaryMessages = createDailySummaryMessage(results, uniqueJobs.length);
    
    for (const summaryMessage of summaryMessages) {
      await channel.send(summaryMessage);
      await delay(1000); // Small delay between summary messages
    }

    // Send error details if any failures occurred
    if (results.failed.length > 0) {
      const errorDetails = results.failed
        .map(f => `**${f.name}**: ${f.reason}`)
        .join("\n");

      // Check if error details exceed Discord limit
      if (errorDetails.length > 1900) {
        const truncatedError = errorDetails.substring(0, 1900) + "...\n*[Error details truncated]*";
        await channel.send(`❌ **Error Details:**\n${truncatedError}`);
      } else {
        await channel.send(`❌ **Error Details:**\n${errorDetails}`);
      }
    }
  }

  return results;
}

/**
 * Display usage information
 */
function showUsage() {
  const availableSources = Object.keys(availableScrapers).join(", ");

  console.log(`
📖 Job Scraper Usage:

🔹 Run comprehensive scraping (all sources with optimization):
   node scrape.js

🔹 Run specific source scraping:
   node scrape.js <source_name>

📋 Available sources:
   ${availableSources}

💡 Examples:
   node scrape.js linkedin              # LinkedIn comprehensive (past week focus)
   node scrape.js github                # GitHub repositories
   node scrape.js ziprecruiter          # ZipRecruiter jobs

🎓 Job Types Included:
   • Internships (intern, co-op, student positions)
   • New Graduate/Entry Level (new grad, entry level, junior positions)

⚡ Optimization Features:
   • Intelligent source skipping (avoids re-scraping recent sources)
   • Parallel processing for faster execution
   • Cross-source job deduplication
   • Smart caching with MongoDB
   • Priority-based scraping (high → medium → low)
   • Multi-role scraping (internships + new graduate positions)
  `);
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
          // Run comprehensive scraping (all sources with optimization)
          loggerService.log(
            "🚀 No specific source provided, running optimized comprehensive scraping"
          );
          results = await runComprehensiveScrape(client);

          loggerService.log("🎉 All scraping tasks completed");
          loggerService.log(
            `Final results: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`
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
  loggerService.log("🚀 Initializing optimized comprehensive job scraper...");
}
runScraper();
