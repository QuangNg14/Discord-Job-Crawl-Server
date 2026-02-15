const { EmbedBuilder } = require("discord.js");
const linkedinScraper = require("../scrapers/linkedin");
const simplyhiredScraper = require("../scrapers/simplyhired");
const ziprecruiterScraper = require("../scrapers/ziprecruiter");
const jobrightScraper = require("../scrapers/jobright");
const glassdoorScraper = require("../scrapers/glassdoor");
const githubScraper = require("../scrapers/github");
const mongoService = require("./mongo");
const logger = require("./logger");
const config = require("../config");

// Command status tracking
let commandStatus = {
  linkedin: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
  simplyhired: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
  ziprecruiter: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
  jobright: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
  glassdoor: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
  github: {
    lastRun: null,
    success: false,
    jobsFound: 0,
    errorCount: 0,
  },
};

/**
 * Process a command from Discord
 * @param {string} command - The command name
 * @param {object} message - The Discord message object
 * @param {object} client - The Discord client
 */
async function processCommand(command, message, client) {
  try {
    // LinkedIn specific commands
    if (command === "jobslinkedin" || command === "linkedin") {
      await message.reply(
        "Starting LinkedIn job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobslinkedin",
        { timeFilter: config.linkedin.timeFilters.day },
        client
      );
    }
    // LinkedIn time-specific commands
    else if (command === "linkedinday") {
      await message.reply(
        "Starting LinkedIn job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobslinkedin",
        { timeFilter: config.linkedin.timeFilters.day },
        client
      );
    } else if (command === "linkedinweek") {
      await message.reply(
        "Starting LinkedIn job scraping for the past week..."
      );
      await executeCommand(
        "jobslinkedin",
        { timeFilter: config.linkedin.timeFilters.week },
        client
      );
    } else if (command === "linkedinmonth") {
      await message.reply(
        "Starting LinkedIn job scraping for the past month..."
      );
      await executeCommand(
        "jobslinkedin",
        { timeFilter: config.linkedin.timeFilters.month },
        client
      );
    }

    // SimplyHired specific commands
    else if (command === "jobssimplyhired" || command === "simplyhired") {
      await message.reply(
        "Starting SimplyHired job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobssimplyhired",
        { timeFilter: config.simplyhired.timeFilters.day },
        client
      );
    }
    // SimplyHired time-specific commands
    else if (command === "simplyhiredday") {
      await message.reply(
        "Starting SimplyHired job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobssimplyhired",
        { timeFilter: config.simplyhired.timeFilters.day },
        client
      );
    } else if (command === "simplyhiredweek") {
      await message.reply(
        "Starting SimplyHired job scraping for the past week..."
      );
      await executeCommand(
        "jobssimplyhired",
        { timeFilter: config.simplyhired.timeFilters.week },
        client
      );
    } else if (command === "simplyhiredmonth") {
      await message.reply(
        "Starting SimplyHired job scraping for the past month..."
      );
      await executeCommand(
        "jobssimplyhired",
        { timeFilter: config.simplyhired.timeFilters.month },
        client
      );
    }

    // ZipRecruiter specific commands
    else if (command === "jobsziprecruiter" || command === "ziprecruiter") {
      await message.reply(
        "Starting ZipRecruiter job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobsziprecruiter",
        { timeFilter: config.ziprecruiter.timeFilters.day },
        client
      );
    }
    // ZipRecruiter time-specific commands
    else if (command === "ziprecruiterday") {
      await message.reply(
        "Starting ZipRecruiter job scraping for the past 24 hours..."
      );
      await executeCommand(
        "jobsziprecruiter",
        { timeFilter: config.ziprecruiter.timeFilters.day },
        client
      );
    } else if (command === "ziprecruiterweek") {
      await message.reply(
        "Starting ZipRecruiter job scraping for the past week..."
      );
      await executeCommand(
        "jobsziprecruiter",
        { timeFilter: config.ziprecruiter.timeFilters.week },
        client
      );
    } else if (command === "ziprecruitermonth") {
      await message.reply(
        "Starting ZipRecruiter job scraping for the past month..."
      );
      await executeCommand(
        "jobsziprecruiter",
        { timeFilter: config.ziprecruiter.timeFilters.month },
        client
      );
    }

    // Jobright specific commands
    else if (command === "jobsjobright" || command === "jobright") {
      await message.reply("Starting Jobright.ai job scraping...");
      await executeCommand("jobsjobright", {}, client);
    }

    // Glassdoor specific commands
    else if (command === "jobsglassdoor" || command === "glassdoor") {
      await message.reply(
        "Starting Glassdoor job scraping for the past 24 hours..."
      );
      await executeCommand("jobsglassdoor", { timeFilter: "day" }, client);
    }
    // Glassdoor time-specific commands
    else if (command === "glassdoorday") {
      await message.reply(
        "Starting Glassdoor job scraping for the past 24 hours..."
      );
      await executeCommand("jobsglassdoor", { timeFilter: "day" }, client);
    } else if (command === "glassdoorweek") {
      await message.reply(
        "Starting Glassdoor job scraping for the past week..."
      );
      await executeCommand("jobsglassdoor", { timeFilter: "week" }, client);
    } else if (command === "glassdoormonth") {
      await message.reply(
        "Starting Glassdoor job scraping for the past month..."
      );
      await executeCommand("jobsglassdoor", { timeFilter: "month" }, client);
    }

    // GitHub specific commands
    else if (command === "jobsgithub" || command === "github") {
      await message.reply("Starting GitHub repositories scraping...");
      await executeCommand("jobsgithub", {}, client);
    }
    // GitHub repo-specific commands
    else if (command === "jobssimplify") {
      await message.reply(
        "Starting GitHub job scraping for SimplifyJobs repository..."
      );
      await executeCommand(
        "jobsgithubspecific",
        { repoName: "SimplifyJobs" },
        client
      );
    } else if (command === "jobsoffsimplify") {
      await message.reply(
        "Starting GitHub job scraping for SimplifyJobs Off-Season repository..."
      );
      await executeCommand(
        "jobsgithubspecific",
        { repoName: "SimplifyJobsOffSeason" },
        client
      );
    } else if (command === "jobsvans") {
      await message.reply(
        "Starting GitHub job scraping for Vanshb03 repository..."
      );
      await executeCommand(
        "jobsgithubspecific",
        { repoName: "Vanshb03" },
        client
      );
    } else if (command === "jobsspeedy") {
      await message.reply(
        "Starting GitHub job scraping for SpeedyApply repository..."
      );
      await executeCommand(
        "jobsgithubspecific",
        { repoName: "SpeedyApply" },
        client
      );
    }

    // Combined jobs commands (all sources)
    else if (command === "jobs") {
      await message.reply("Starting job scraping from all sources...");
      await executeCommand(
        "jobsallsources",
        {
          linkedinTimeFilter: config.linkedin.timeFilters.day,
          simplyhiredTimeFilter: config.simplyhired.timeFilters.day,
          ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.day,
          glassdoorTimeFilter: "day",
        },
        client
      );
    }
    // Combined time-specific commands
    else if (command === "jobsday") {
      await message.reply(
        "Starting job scraping from all sources for the past 24 hours..."
      );
      await executeCommand(
        "jobsallsources",
        {
          linkedinTimeFilter: config.linkedin.timeFilters.day,
          simplyhiredTimeFilter: config.simplyhired.timeFilters.day,
          ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.day,
          glassdoorTimeFilter: "day",
        },
        client
      );
    } else if (command === "jobsweek") {
      await message.reply(
        "Starting job scraping from all sources for the past week..."
      );
      await executeCommand(
        "jobsallsources",
        {
          linkedinTimeFilter: config.linkedin.timeFilters.week,
          simplyhiredTimeFilter: config.simplyhired.timeFilters.week,
          ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.week,
          glassdoorTimeFilter: "week",
        },
        client
      );
    } else if (command === "jobsmonth") {
      await message.reply(
        "Starting job scraping from all sources for the past month..."
      );
      await executeCommand(
        "jobsallsources",
        {
          linkedinTimeFilter: config.linkedin.timeFilters.month,
          simplyhiredTimeFilter: config.simplyhired.timeFilters.month,
          ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.month,
          glassdoorTimeFilter: "month",
        },
        client
      );
    } else if (command === "jobsall") {
      await message.reply(
        "Starting job scraping from all sources including GitHub repositories..."
      );
      await executeCommand(
        "jobseverything",
        {
          linkedinTimeFilter: config.linkedin.timeFilters.day,
          simplyhiredTimeFilter: config.simplyhired.timeFilters.day,
          ziprecruiterTimeFilter: config.ziprecruiter.timeFilters.day,
          glassdoorTimeFilter: "day",
        },
        client
      );
    }

    // Cache management commands
    else if (command === "clearcache") {
      await mongoService.clearAllCaches();
      await message.reply("Job cache has been cleared for all sources.");
    } else if (command === "clearlinkedincache") {
      await mongoService.clearCache("linkedin");
      await message.reply("LinkedIn job cache has been cleared.");
    } else if (command === "clearsimplyhiredcache") {
      await mongoService.clearCache("simplyhired");
      await message.reply("SimplyHired job cache has been cleared.");
    } else if (command === "clearziprecruiter") {
      await mongoService.clearCache("ziprecruiter");
      await message.reply("ZipRecruiter job cache has been cleared.");
    } else if (command === "clearjobright") {
      await mongoService.clearCache("jobright");
      await message.reply("Jobright.ai job cache has been cleared.");
    } else if (command === "clearglassdoor") {
      await mongoService.clearCache("glassdoor");
      await message.reply("Glassdoor job cache has been cleared.");
    } else if (command === "cleargithub") {
      await mongoService.clearCache("github");
      await message.reply("GitHub job cache has been cleared.");
    }

    // Status commands
    else if (command === "status") {
      await sendStatusReport(message, client);
    } else if (command === "dbstatus") {
      await sendDatabaseStatus(message, client);
    } else if (command === "help") {
      await sendHelpMessage(message);
    } else {
      // Unknown command
      if (
        command.startsWith("jobs") ||
        command.startsWith("linkedin") ||
        command.startsWith("simplyhired") ||
        command.startsWith("ziprecruiter") ||
        command.startsWith("jobright") ||
        command.startsWith("glassdoor") ||
        command.startsWith("github")
      ) {
        await message.reply(
          `Unknown command: !${command}. Type !help to see available commands.`
        );
      }
    }
  } catch (error) {
    logger.log(
      `Error processing command ${command}: ${error.message}`,
      "error"
    );
    try {
      await message.reply(
        `Error processing command: ${error.message.substring(0, 100)}`
      );
    } catch (replyError) {
      logger.log(`Error sending error reply: ${replyError.message}`, "error");
    }
  }
}

/**
 * Execute a command without user interaction (for scheduled tasks)
 * @param {string} command - The command to execute
 * @param {object} options - Command options
 * @param {object} client - The Discord client
 */
async function executeCommand(command, options, client) {
  try {
    let jobs = [];
    let source = "";
    let timeFilter = options?.timeFilter || "day";

    switch (command) {
      case "jobseverything":
        // Execute all scrapers in parallel
        const results = await Promise.all([
          linkedinScraper.scrapeAllJobs(
            options?.linkedinTimeFilter || config.linkedin.timeFilters.day,
            client
          ),
          simplyhiredScraper.scrapeAllJobs(
            options?.simplyhiredTimeFilter ||
              config.simplyhired.timeFilters.day,
            client
          ),
          ziprecruiterScraper.scrapeAllJobs(
            options?.ziprecruiterTimeFilter ||
              config.ziprecruiter.timeFilters.day,
            client
          ),
          jobrightScraper.scrapeAllJobs(client),
          glassdoorScraper.scrapeAllJobs(
            options?.glassdoorTimeFilter || "day",
            client
          ),
          githubScraper.scrapeAllJobs(client),
        ]);

        // Process results from all scrapers
        const sourceNames = ["linkedin", "simplyhired", "ziprecruiter", "jobright", "glassdoor", "github"];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result && result.jobsFound > 0 && sourceNames[i]) {
            commandStatus[sourceNames[i]] = result;
          }
        }

        // Send summary message
        const targetChannel = client.channels.cache.get(config.logChannelId);
        if (targetChannel) {
          const totalJobs = results.reduce(
            (sum, result) => sum + (result?.jobsFound || 0),
            0
          );
          await targetChannel.send(
            `Job scraping complete for all sources. Found ${totalJobs} new jobs total.`
          );
        }

        return {
          linkedin: results[0],
          simplyhired: results[1],
          ziprecruiter: results[2],
          jobright: results[3],
          glassdoor: results[4],
          github: results[5],
          totalJobs: results.reduce(
            (sum, result) => sum + (result?.jobsFound || 0),
            0
          ),
        };
      case "jobslinkedin":
        // Map time filter to LinkedIn config
        const linkedinTimeFilter =
          config.linkedin.timeFilters[options.timeFilter] ||
          config.linkedin.timeFilters.day;
        // Always use discord mode for slash commands (lightweight)
        const linkedinMode = "discord";
        const linkedinRole = options.role || "intern";

        const result = await linkedinScraper.scrapeAllJobs(
          linkedinTimeFilter,
          client,
          linkedinMode,
          linkedinRole
        );
        commandStatus.linkedin = result;
        return result;
      case "jobssimplyhired":
        const resultSimplyhired = await simplyhiredScraper.scrapeAllJobs(
          options.timeFilter,
          client,
          "discord",
          options.role || "intern"
        );
        commandStatus.simplyhired = resultSimplyhired;
        return resultSimplyhired;
      case "jobsziprecruiter":
        const resultZiprecruiter = await ziprecruiterScraper.scrapeAllJobs(
          options.timeFilter,
          client,
          "discord",
          options.role || "intern"
        );
        commandStatus.ziprecruiter = resultZiprecruiter;
        return resultZiprecruiter;
      case "jobsjobright":
        const resultJobright = await jobrightScraper.scrapeAllJobs(
          client,
          "discord",
          options.role || "intern"
        );
        commandStatus.jobright = resultJobright;
        return resultJobright;
      case "jobsglassdoor":
        const resultGlassdoor = await glassdoorScraper.scrapeAllJobs(
          options.timeFilter,
          client,
          "discord",
          options.role || "intern"
        );
        commandStatus.glassdoor = resultGlassdoor;
        return resultGlassdoor;
      case "jobsgithub":
        const resultGithub = await githubScraper.scrapeAllJobs(
          client,
          "discord",
          options.role || "intern",
          options.timeFilter || "day"
        );
        commandStatus.github = resultGithub;
        return resultGithub;
      case "daily":
        // Import the daily scraper function
        const { runDailyComprehensiveScrape } = require("../daily-scraper");
        
        const dailyChannel = client.channels.cache.get(config.logChannelId);
        if (dailyChannel) {
          await dailyChannel.send("🚀 Starting daily comprehensive scraping of all sources...");
        }
        
        try {
          const dailyResults = await runDailyComprehensiveScrape(client);
          
          // Update command status for all sources
          dailyResults.successful.forEach(source => {
            if (commandStatus[source.name.toLowerCase()]) {
              commandStatus[source.name.toLowerCase()] = {
                lastRun: new Date(),
                success: true,
                jobsFound: dailyResults.totalJobsFound,
                errorCount: 0
              };
            }
          });
          
          return {
            success: true,
            jobsFound: dailyResults.totalJobsFound,
            duration: dailyResults.duration,
            successful: dailyResults.successful.length,
            failed: dailyResults.failed.length
          };
        } catch (error) {
          logger.log(`Daily scraping failed: ${error.message}`, "error");
          return {
            success: false,
            error: error.message,
            jobsFound: 0
          };
        }
      case "jobsgithubspecific":
        const resultGithubSpecific = await githubScraper.scrapeSpecificRepo(
          options.repoName,
          client,
          "discord",
          options.role || "intern",
          options.timeFilter || "day"
        );
        // Update command status but only for successfully scraped repos
        if (resultGithubSpecific.success) {
          if (!commandStatus.github.lastRun) {
            commandStatus.github = {
              lastRun: resultGithubSpecific.lastRun,
              success: resultGithubSpecific.success,
              jobsFound: resultGithubSpecific.jobsFound,
              errorCount: resultGithubSpecific.errorCount,
            };
          } else {
            commandStatus.github.jobsFound += resultGithubSpecific.jobsFound;
            commandStatus.github.errorCount += resultGithubSpecific.errorCount;
          }
        }
        return resultGithubSpecific;
      case "jobsallsources":
        // Run all job board scrapers (excluding GitHub)
        const channel = client.channels.cache.get(config.logChannelId);
        if (channel) {
          await channel.send(
            "Starting job scraping from all job board sources..."
          );
        }

        // Run all job scrapers
        const linkedinResult = await linkedinScraper.scrapeAllJobs(
          options.linkedinTimeFilter,
          client
        );
        commandStatus.linkedin = linkedinResult;

        const simplyhiredResult = await simplyhiredScraper.scrapeAllJobs(
          options.simplyhiredTimeFilter,
          client
        );
        commandStatus.simplyhired = simplyhiredResult;

        const ziprecruiterResult = await ziprecruiterScraper.scrapeAllJobs(
          options.ziprecruiterTimeFilter,
          client
        );
        commandStatus.ziprecruiter = ziprecruiterResult;

        const jobrightResult = await jobrightScraper.scrapeAllJobs(client);
        commandStatus.jobright = jobrightResult;

        const glassdoorResult = await glassdoorScraper.scrapeAllJobs(
          options.glassdoorTimeFilter,
          client
        );
        commandStatus.glassdoor = glassdoorResult;

        // Send summary message
        if (channel) {
          const totalJobs =
            linkedinResult.jobsFound +
            simplyhiredResult.jobsFound +
            ziprecruiterResult.jobsFound +
            jobrightResult.jobsFound +
            glassdoorResult.jobsFound;

          await channel.send(
            `Job scraping complete for all job board sources. Found ${totalJobs} new jobs total:\n` +
              `- LinkedIn: ${linkedinResult.jobsFound}\n` +
              `- SimplyHired: ${simplyhiredResult.jobsFound}\n` +
              `- ZipRecruiter: ${ziprecruiterResult.jobsFound}\n` +
              `- Jobright.ai: ${jobrightResult.jobsFound}\n` +
              `- Glassdoor: ${glassdoorResult.jobsFound}`
          );
        }

        return {
          linkedin: linkedinResult,
          simplyhired: simplyhiredResult,
          ziprecruiter: ziprecruiterResult,
          jobright: jobrightResult,
          glassdoor: glassdoorResult,
          totalJobs:
            linkedinResult.jobsFound +
            simplyhiredResult.jobsFound +
            ziprecruiterResult.jobsFound +
            jobrightResult.jobsFound +
            glassdoorResult.jobsFound,
        };
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    logger.log(`Error executing command ${command}: ${error.message}`, "error");
    return { error: error.message };
  }
}

/**
 * Send status report to Discord
 * @param {object} message - Discord message object
 */
async function sendStatusReport(message) {
  try {
    const cacheStats = await mongoService.getAllCacheStats();

    const statusEmbed = new EmbedBuilder()
      .setTitle("Job Bot Status")
      .setColor("#00FF00")
      .addFields({
        name: "Total Cache Size",
        value: cacheStats.total.toString(),
        inline: false,
      });

    // Add LinkedIn status info if available
    if (commandStatus.linkedin.lastRun) {
      statusEmbed.addFields(
        {
          name: "LinkedIn Last Run",
          value: commandStatus.linkedin.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "LinkedIn Status",
          value: commandStatus.linkedin.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "LinkedIn Jobs Found",
          value: commandStatus.linkedin.jobsFound.toString(),
          inline: true,
        }
      );
    }

    // Add SimplyHired status info if available
    if (commandStatus.simplyhired.lastRun) {
      statusEmbed.addFields(
        {
          name: "SimplyHired Last Run",
          value: commandStatus.simplyhired.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "SimplyHired Status",
          value: commandStatus.simplyhired.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "SimplyHired Jobs Found",
          value: commandStatus.simplyhired.jobsFound.toString(),
          inline: true,
        }
      );
    }

    // Add ZipRecruiter status info if available
    if (commandStatus.ziprecruiter.lastRun) {
      statusEmbed.addFields(
        {
          name: "ZipRecruiter Last Run",
          value: commandStatus.ziprecruiter.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "ZipRecruiter Status",
          value: commandStatus.ziprecruiter.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "ZipRecruiter Jobs Found",
          value: commandStatus.ziprecruiter.jobsFound.toString(),
          inline: true,
        }
      );
    }

    // Add Jobright status info if available
    if (commandStatus.jobright.lastRun) {
      statusEmbed.addFields(
        {
          name: "Jobright.ai Last Run",
          value: commandStatus.jobright.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "Jobright.ai Status",
          value: commandStatus.jobright.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "Jobright.ai Jobs Found",
          value: commandStatus.jobright.jobsFound.toString(),
          inline: true,
        }
      );
    }

    // Add Glassdoor status info if available
    if (commandStatus.glassdoor.lastRun) {
      statusEmbed.addFields(
        {
          name: "Glassdoor Last Run",
          value: commandStatus.glassdoor.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "Glassdoor Status",
          value: commandStatus.glassdoor.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "Glassdoor Jobs Found",
          value: commandStatus.glassdoor.jobsFound.toString(),
          inline: true,
        }
      );
    }

    // Add GitHub status info if available
    if (commandStatus.github.lastRun) {
      statusEmbed.addFields(
        {
          name: "GitHub Last Run",
          value: commandStatus.github.lastRun.toLocaleString(),
          inline: true,
        },
        {
          name: "GitHub Status",
          value: commandStatus.github.success ? "Success" : "Failed",
          inline: true,
        },
        {
          name: "GitHub Posts Found",
          value: commandStatus.github.jobsFound.toString(),
          inline: true,
        }
      );
    }

    statusEmbed.setFooter({
      text: `Job Bot Status | ${new Date().toLocaleString()}`,
    });
    await message.reply({ embeds: [statusEmbed] });
  } catch (error) {
    logger.log(`Error sending status: ${error.message}`, "error");
    await message.reply("Error generating status report.");
  }
}

/**
 * Send database status to Discord
 * @param {object} message - Discord message object
 */
async function sendDatabaseStatus(message) {
  try {
    const cacheStats = await mongoService.getAllCacheStats();

    const dbStatusEmbed = new EmbedBuilder()
      .setTitle("Database Status")
      .setColor("#0077b5")
      .addFields(
        {
          name: "Database Type",
          value: cacheStats.linkedin.source.includes("MongoDB")
            ? "MongoDB"
            : "File-based",
          inline: true,
        },
        {
          name: "LinkedIn Cache Count",
          value: cacheStats.linkedin.count.toString(),
          inline: true,
        },
        {
          name: "SimplyHired Cache Count",
          value: cacheStats.simplyhired.count.toString(),
          inline: true,
        },
        {
          name: "ZipRecruiter Cache Count",
          value: cacheStats.ziprecruiter.count.toString(),
          inline: true,
        },
        {
          name: "Jobright.ai Cache Count",
          value: cacheStats.jobright.count.toString(),
          inline: true,
        },
        {
          name: "Glassdoor Cache Count",
          value: cacheStats.glassdoor.count.toString(),
          inline: true,
        },
        {
          name: "GitHub Cache Count",
          value: cacheStats.github.count.toString(),
          inline: true,
        },
        {
          name: "Total Cache Size",
          value: cacheStats.total.toString(),
          inline: true,
        }
      );

    dbStatusEmbed.setFooter({
      text: `Database Status | ${new Date().toLocaleString()}`,
    });
    await message.reply({ embeds: [dbStatusEmbed] });
  } catch (error) {
    logger.log(`Error sending database status: ${error.message}`, "error");
    await message.reply("Error getting database status.");
  }
}

/**
 * Send help message to Discord
 * @param {object} message - Discord message object
 */
async function sendHelpMessage(message) {
  try {
    const helpEmbed = new EmbedBuilder()
      .setTitle("Job Bot Commands")
      .setColor("#0077b5")
      .setDescription("Available commands:")
      .addFields(
        {
          name: "Job Board Commands",
          value:
            "!jobs - Scrape all job board sources (LinkedIn, SimplyHired, etc.)\n" +
            "!jobsDay - Scrape all job boards for the past 24 hours\n" +
            "!jobsWeek - Scrape all job boards for the past week\n" +
            "!jobsMonth - Scrape all job boards for the past month",
        },
        {
          name: "GitHub Commands",
          value:
            "!github - Scrape all GitHub repositories\n" +
            "!jobsSimplify - Scrape the SimplifyJobs repository\n" +
            "!jobsOffSimplify - Scrape the SimplifyJobs Off-Season repository\n" +
            "!jobsVans - Scrape the Vanshb03 repository\n" +
            "!jobsSpeedy - Scrape the SpeedyApply repository\n" +
            "!clearGithub - Clear GitHub job cache",
        },
        {
          name: "LinkedIn Commands",
          value:
            "!linkedin - Scrape LinkedIn jobs for the past 24 hours\n" +
            "!linkedinDay - Scrape LinkedIn jobs for the past 24 hours\n" +
            "!linkedinWeek - Scrape LinkedIn jobs for the past week\n" +
            "!linkedinMonth - Scrape LinkedIn jobs for the past month\n" +
            "!clearLinkedinCache - Clear LinkedIn job cache",
        },
        {
          name: "SimplyHired Commands",
          value:
            "!simplyhired - Scrape SimplyHired jobs for the past 24 hours\n" +
            "!simplyhiredDay - Scrape SimplyHired jobs for the past 24 hours\n" +
            "!simplyhiredWeek - Scrape SimplyHired jobs for the past week\n" +
            "!simplyhiredMonth - Scrape SimplyHired jobs for the past month\n" +
            "!clearSimplyhiredCache - Clear SimplyHired job cache",
        },
        {
          name: "Other Job Sources",
          value:
            "!ziprecruiter - Scrape ZipRecruiter jobs\n" +
            "!jobright - Scrape Jobright.ai jobs\n" +
            "!glassdoor - Scrape Glassdoor jobs",
        },
        {
          name: "Combined Commands",
          value:
            "!jobsAll - Scrape ALL sources (job boards + GitHub)\n" +
            "!clearCache - Clear all job caches",
        },
        {
          name: "Status Commands",
          value:
            "!status - Check bot status and statistics\n" +
            "!dbStatus - Check database connection status\n" +
            "!help - Show this help message",
        }
      )
      .setFooter({ text: "Job Scraping Bot" });
    await message.reply({ embeds: [helpEmbed] });
  } catch (error) {
    logger.log(`Error sending help: ${error.message}`, "error");
    await message.reply("Error generating help message.");
  }
}

/**
 * Handle slash command interactions
 * @param {object} interaction - The Discord interaction object
 * @param {object} client - The Discord client
 */
async function handleSlash(interaction, client) {
  try {
    const command = interaction.commandName;
    const options = interaction.options;

    // Get role and time options if they exist
    const role = options.getString("role") || "both";
    const time = options.getString("time") || "day";

    // Map slash commands to their corresponding legacy commands
    const commandMap = {
      jobs: "jobseverything",
      linkedin: "jobslinkedin",
      simplyhired: "jobssimplyhired",
      ziprecruiter: "jobsziprecruiter",
      jobright: "jobsjobright",
      glassdoor: "jobsglassdoor",
      github: "jobsgithub",
      daily: "daily",
      status: "status",
      clearcache: "clearcache",
    };

    const legacyCommand = commandMap[command];
    if (!legacyCommand) {
      await interaction.reply({ content: "Unknown command", ephemeral: true });
      return;
    }

    // Defer the reply since scraping might take time
    await interaction.deferReply();

    // Prepare options based on the command
    let commandOptions = {};
    if (legacyCommand === "jobseverything") {
      commandOptions = {
        linkedinTimeFilter: time,
        simplyhiredTimeFilter: time,
        ziprecruiterTimeFilter: time,
        glassdoorTimeFilter: time,
      };
    } else if (legacyCommand === "jobslinkedin") {
      // Handle LinkedIn-specific options
      const mode = options.getString("mode") || "discord";
      commandOptions = {
        timeFilter: time,
        mode: mode,
        role: role,
      };
    } else if (legacyCommand === "jobsgithub") {
      const repo = options.getString("repo");
      if (repo) {
        commandOptions = { repo };
      }
    } else if (legacyCommand === "daily") {
      const runNow = options.getBoolean("now") || false;
      commandOptions = { runNow };
    } else if (legacyCommand === "clearcache") {
      const source = options.getString("source");
      if (source) {
        commandOptions = { source };
      }
    } else if (legacyCommand !== "status") {
      commandOptions = { timeFilter: time, role: role };
    }

    // Execute the command
    await executeCommand(legacyCommand, commandOptions, client);

    // Send a follow-up message
    await interaction.followUp({ content: `Command ${command} completed!` });
  } catch (error) {
    logger.log(`Error handling slash command: ${error.message}`, "error");
    await interaction.followUp({
      content: "An error occurred while processing the command.",
      ephemeral: true,
    });
  }
}

// Export the functions
module.exports = {
  processCommand,
  executeCommand,
  handleSlash,
};
