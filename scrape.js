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
  sendJobsToDiscord,
  filterRelevantJobs,
  normalizeJob,
  generateJobId,
} = require("./utils/helpers");

// Import all scrapers
const linkedinScraper = require("./scrapers/linkedin");
const ziprecruiterScraper = require("./scrapers/ziprecruiter");
const jobrightScraper = require("./scrapers/jobright");
const githubScraper = require("./scrapers/github");
const simplyhiredScraper = require("./scrapers/simplyhired");
const glassdoorScraper = require("./scrapers/glassdoor");

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
        "comprehensive",
        "both"
      ),
  },
  ziprecruiter: {
    name: "ZipRecruiter",
    scraper: (client) =>
      ziprecruiterScraper.scrapeAllJobs(
        config.ziprecruiter.timeFilters.day,
        client,
        "comprehensive",
        "both"
      ),
  },
  jobright: {
    name: "JobRight",
    scraper: (client) => jobrightScraper.scrapeAllJobs(client, "comprehensive", "both"),
  },
  github: {
    name: "GitHub",
    scraper: (client) =>
      githubScraper.scrapeAllJobs(client, "comprehensive", "both", "week"),
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
    const skipResult = await mongoService.shouldSkipSource(
      sourceName,
      optimization.cacheTimeRange
    );
    return skipResult;
  } catch (error) {
    loggerService.log(
      `Error checking skip status for ${sourceName}: ${error.message}`,
      "error"
    );
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
    const existingJobs = await mongoService.getRecentJobs(
      sourceName,
      timeRange
    );
    loggerService.log(
      `📋 Found ${existingJobs.length} existing jobs for ${sourceName} (${timeRange})`
    );
    return existingJobs;
  } catch (error) {
    loggerService.log(
      `Error getting existing jobs for ${sourceName}: ${error.message}`,
      "error"
    );
    return [];
  }
}

/**
 * Collect jobs from a scraper with intelligent caching and send individual summaries
 * @param {Function} scraperFunction - The scraper function to call
 * @param {string} sourceName - Name of the source
 * @param {object} channel - Discord channel for sending summaries (legacy, will use client for routing)
 * @param {object} client - Discord client for channel routing
 * @param {string} priority - Priority level of the source
 * @param {string} role - Role type (intern, new_grad, or both)
 * @returns {Object} Object with jobs and metadata
 */
async function collectJobsFromSource(
  scraperFunction,
  sourceName,
  channel,
  client,
  priority,
  role = "both",
  options = {}
) {
  const optimization = config.dailyScraping.optimization;
  const startTime = Date.now();
  const dedupeContext = options.dedupeContext;
  const discordSendQueue = options.discordSendQueue;

  try {
    loggerService.log(
      `🔍 Collecting jobs from ${sourceName} for role: ${role}...`
    );

    // Check if we should skip this source
    const skipDecision = await shouldSkipSource(sourceName);
    if (skipDecision.shouldSkip) {
      loggerService.log(`⏭️ Skipping ${sourceName}: ${skipDecision.reason}`);

      // Get existing jobs if we're reusing them
      let existingJobs = [];
      if (optimization.reuseExistingJobs) {
        existingJobs = await getExistingJobs(
          sourceName,
          optimization.cacheTimeRange
        );
        loggerService.log(
          `📋 Reusing ${existingJobs.length} existing jobs from ${sourceName}`
        );
      }

      // Send skip notification to Discord
      if (client) {
        await sendSourceSummaryToDiscord(
          null,
          sourceName,
          existingJobs,
          {
            client: client,
            skipped: true,
            reason: skipDecision.reason,
            priority: priority,
            role: role,
            duration: Date.now() - startTime,
          },
          delay
        );
      }

      return {
        jobs: existingJobs,
        jobsFound: existingJobs.length,
        skipped: true,
        reason: skipDecision.reason,
        duration: Date.now() - startTime,
      };
    }

    // Create a mock client for job collection
    const mockClient = {
      channels: {
        cache: {
          get: () => null, // Don't send messages during collection
        },
      },
    };

    loggerService.log(`📡 [${sourceName}] Scraper starting (role=${role})...`);
    const scraperStart = Date.now();

    let result;
    try {
      result = await scraperFunction(mockClient, role);
    } catch (scraperErr) {
      loggerService.log(`❌ [${sourceName}] Scraper threw: ${scraperErr.message}`, "error");
      loggerService.log(`❌ [${sourceName}] Stack: ${scraperErr.stack}`, "error");
      throw scraperErr;
    }

    const scraperDuration = Date.now() - scraperStart;
    const rawCount = result?.jobs?.length ?? 0;
    const reportedNew = result?.jobsFound ?? 0;
    loggerService.log(`📡 [${sourceName}] Scraper returned in ${scraperDuration}ms: jobsFound=${reportedNew}, jobs.length=${rawCount}${result?.errorCount > 0 ? `, errors=${result.errorCount}` : ""}`);

    const jobsAvailable = result && ((result.jobsFound > 0) || (result.jobs && result.jobs.length > 0));
    if (jobsAvailable) {
      loggerService.log(
        `✅ Collected ${
          result.jobsFound
        } new jobs (${(result.jobs || []).length} total) from ${sourceName} (${role}) in ${Date.now() - startTime}ms`
      );

      let jobsForProcessing = result.jobs || [];
      const skipMongoDedupe = options?.skipMongoDedupe === true;

      if (dedupeContext?.enabled && jobsForProcessing.length > 0) {
        // Cross-day dedup: use the pre-run snapshot of known IDs (taken BEFORE
        // scrapers started adding to MongoDB). This avoids the race condition
        // where scrapers cache jobs internally, then the outer dedup thinks
        // they are "old" because they were just added during this same run.
        // Skip for curated sources (like JobRight) that explicitly opt out.
        if (!skipMongoDedupe && dedupeContext.preRunIds && dedupeContext.preRunIds.size > 0) {
          const beforeCount = jobsForProcessing.length;
          jobsForProcessing = jobsForProcessing.filter((job) => {
            const nid = job.normalizedId || generateJobId(job);
            return !dedupeContext.preRunIds.has(nid);
          });
          if (jobsForProcessing.length < beforeCount) {
            loggerService.log(
              `🧹 Cross-day dedup: ${beforeCount} → ${jobsForProcessing.length} (removed ${beforeCount - jobsForProcessing.length} already-known jobs)`
            );
          }
        }

        // Cross-source dedup within this run: prevent same job from multiple sources
        if (dedupeContext.seenNormalizedIds) {
          const beforeDedupe = jobsForProcessing.length;
          const uniqueJobs = [];
          for (const job of jobsForProcessing) {
            const normalizedId = job.normalizedId || generateJobId(job);
            if (!dedupeContext.seenNormalizedIds.has(normalizedId)) {
              dedupeContext.seenNormalizedIds.add(normalizedId);
              uniqueJobs.push({ ...job, normalizedId });
            }
          }
          jobsForProcessing = uniqueJobs;
          if (beforeDedupe !== jobsForProcessing.length) {
            loggerService.log(`📡 [${sourceName}] After in-run dedup: ${beforeDedupe} → ${jobsForProcessing.length} jobs`);
          }
        }
      }

      loggerService.log(`📡 [${sourceName}] Sending ${jobsForProcessing.length} jobs to Discord (${role})`);

      // Send individual source summary to Discord
      if (client) {
        const sendToDiscord = async () => {
          await sendSourceSummaryToDiscord(
            null,
            sourceName,
            jobsForProcessing,
            {
              client: client,
              jobsFound: jobsForProcessing.length,
              priority: priority,
              role: role,
              duration: Date.now() - startTime,
            },
            delay
          );

          // Also route individual job embeds to their respective channels
          if (jobsForProcessing && jobsForProcessing.length > 0) {
            await sendJobsToDiscord(
              jobsForProcessing,
              client,
              sourceName,
              role,
              delay
            );
          }
        };

        if (discordSendQueue) {
          await discordSendQueue(sendToDiscord);
        } else {
          await sendToDiscord();
        }
      }

      return {
        jobs: jobsForProcessing,
        jobsFound: jobsForProcessing.length,
        skipped: false,
        reason: "Successfully scraped",
        duration: Date.now() - startTime,
      };
    } else {
      loggerService.log(
        `⚠️ [${sourceName}] No jobs collected (${role}) in ${Date.now() - startTime}ms (scraper returned jobsFound=${reportedNew}, jobs.length=${rawCount})`
      );

      // Send empty summary to Discord
      if (client) {
        await sendSourceSummaryToDiscord(
          null,
          sourceName,
          [],
          {
            client: client,
            jobsFound: 0,
            priority: priority,
            role: role,
            duration: Date.now() - startTime,
          },
          delay
        );
      }

      return {
        jobs: [],
        jobsFound: 0,
        skipped: false,
        reason: "No jobs found",
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    loggerService.log(
      `❌ [${sourceName}] Error collecting jobs (${role}): ${error.message}`,
      "error"
    );
    loggerService.log(`❌ [${sourceName}] Stack: ${error.stack}`, "error");

    // Send error summary to Discord
    if (client) {
      await sendSourceSummaryToDiscord(
        null,
        sourceName,
        [],
        {
          client: client,
          jobsFound: 0,
          priority: priority,
          role: role,
          duration: Date.now() - startTime,
          error: error.message,
        },
        delay
      );
    }

    return {
      jobs: [],
      jobsFound: 0,
      skipped: false,
      reason: `Error: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run scrapers in parallel for a given priority level
 * @param {Array} tasks - Array of scraping tasks
 * @param {string} priority - Priority level
 * @param {object} channel - Discord channel for sending summaries (legacy)
 * @param {object} client - Discord client for channel routing
 * @returns {Array} Array of results
 */
async function runParallelScraping(tasks, priority, channel, client, options = {}) {
  const optimization = config.dailyScraping.optimization;
  const maxConcurrent =
    optimization.maxConcurrentSources && optimization.maxConcurrentSources > 0
      ? optimization.maxConcurrentSources
      : tasks.length;
  const staggerStartMs = optimization.staggerStartMs || 0;

  if (!optimization.parallelScraping) {
    // Sequential processing
    const results = [];
    for (const task of tasks) {
      // Merge task-specific options with global options (task options override)
      const mergedOptions = { ...options, ...(task.options || {}) };
      const result = await collectJobsFromSource(
        task.scraper,
        task.name,
        channel,
        client,
        priority,
        task.role,
        mergedOptions
      );
      results.push({ ...result, name: task.name, priority, role: task.role });
      await delay(2000); // Delay between sources
    }
    return results;
  }

  // Parallel processing
  loggerService.log(
    `🚀 Running ${tasks.length} ${priority}-priority sources in parallel...`
  );

  let runningIndex = 0;
  const results = new Array(tasks.length);

  const worker = async () => {
    while (runningIndex < tasks.length) {
      const index = runningIndex;
      runningIndex += 1;
      const task = tasks[index];

      if (staggerStartMs > 0 && index > 0) {
        await delay(staggerStartMs);
      }

      // Merge task-specific options with global options (task options override)
      const mergedOptions = { ...options, ...(task.options || {}) };
      const result = await collectJobsFromSource(
        task.scraper,
        task.name,
        channel,
        client,
        priority,
        task.role,
        mergedOptions
      );
      results[index] = { ...result, name: task.name, priority, role: task.role };
    }
  };

  const workers = Array.from(
    { length: Math.min(maxConcurrent, tasks.length) },
    () => worker()
  );

  await Promise.all(workers);
  loggerService.log(
    `✅ Completed parallel scraping for ${priority}-priority sources`
  );

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

  const channel = client.channels.cache.get(config.logChannelId);
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
    if (client && result && result.jobs) {
      await sendSourceSummaryToDiscord(
        null,
        scraper.name,
        result.jobs,
        {
          client: client,
          jobsFound: result.jobsFound || 0,
          duration: duration * 1000, // Convert to milliseconds
          priority: "specific",
          role: "both", // Default to both for specific scraper
        },
        delay
      );

      // Also route individual job embeds to their respective channels
      if (result.jobs.length > 0) {
        await sendJobsToDiscord(
          result.jobs,
          client,
          scraper.name,
          "both",
          delay
        );
      }
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
  const requestedRole =
    process.env.DAILY_ROLE &&
    ["intern", "new_grad", "both"].includes(process.env.DAILY_ROLE)
      ? process.env.DAILY_ROLE
      : "both";

  const skipLinkedIn = process.env.SKIP_LINKEDIN === "true" || process.env.SKIP_LINKEDIN === "1";
  const runOtherSourcesOnly = process.env.RUN_OTHER_SOURCES_ONLY === "true" || process.env.RUN_OTHER_SOURCES_ONLY === "1";
  const sourcesLabel = runOtherSourcesOnly
    ? "ZipRecruiter, SimplyHired, Glassdoor (LinkedIn, GitHub, JobRight OFF)"
    : skipLinkedIn
      ? "GitHub (SimplifyJobs), JobRight only (LinkedIn skipped)"
      : "LinkedIn, GitHub, JobRight";

  loggerService.log("🚀 Starting optimized comprehensive job scraping...");
  if (runOtherSourcesOnly) loggerService.log("🧪 Mode: RUN_OTHER_SOURCES_ONLY — testing other sources only.");
  loggerService.log(`📅 Date: ${startTime.toLocaleDateString()}`);
  loggerService.log(`⏰ Time: ${startTime.toLocaleTimeString()}`);
  loggerService.log(
    `⚡ Optimization: ${optimization.enabled ? "Enabled" : "Disabled"}`
  );

  const logChannel = client.channels.cache.get(config.logChannelId);

  // Send start notification
  if (logChannel) {
    await logChannel.send({
      embeds: [
        {
          title: "🤖 Optimized Comprehensive Job Scraping Started",
          description: `Starting intelligent scraping of all job sources for ${startTime.toLocaleDateString()}`,
          color: 0x00ff00,
          fields: [
            {
              name: "📊 Sources",
              value: sourcesLabel,
              inline: false,
            },
            {
              name: "🎯 Job Types",
              value: "Internships & New Graduate/Entry Level",
              inline: false,
            },
            {
              name: "⚡ Optimization",
              value: optimization.enabled ? "Enabled" : "Disabled",
              inline: true,
            },
            {
              name: "🔄 Parallel Processing",
              value: optimization.parallelScraping ? "Enabled" : "Disabled",
              inline: true,
            },
            {
              name: "⏱️ Time Filter",
              value: "Past 24 hours",
              inline: true,
            },
          ],
          footer: {
            text: `Started at ${startTime.toLocaleString()}`,
          },
        },
      ],
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
      newJobsFound: 0,
    },
  };

  const discordSendQueue =
    optimization.discordSequentialSend === false
      ? null
      : (() => {
          let queue = Promise.resolve();
          return (fn) => {
            queue = queue.then(fn).catch((err) => {
              loggerService.log(
                `Discord send queue error: ${err.message}`,
                "error"
              );
            });
            return queue;
          };
        })();

  // When RUN_OTHER_SOURCES_ONLY=true: run only ZipRecruiter, SimplyHired, Glassdoor (WellFound, Dice, CareerJet removed)
  const otherSourceTasks = [
    { name: "ZipRecruiter", priority: "high", role: "both", scraper: (client, role) => ziprecruiterScraper.scrapeAllJobs(config.ziprecruiter.timeFilters.threeDays, client, "comprehensive", role), jobLimit: dailyConfig.jobLimits.ziprecruiter },
    { name: "SimplyHired", priority: "medium", role: "both", scraper: (client, role) => simplyhiredScraper.scrapeAllJobs(config.simplyhired.timeFilters.week, client, "comprehensive", role), jobLimit: dailyConfig.jobLimits.simplyhired },
    { name: "Glassdoor", priority: "medium", role: "both", scraper: (client, role) => glassdoorScraper.scrapeAllJobs("week", client, "comprehensive", role), jobLimit: dailyConfig.jobLimits.glassdoor },
  ];

  // Define scraping tasks with priority and daily limits - now including both roles
  const sourceTasks = [
    // High Priority Sources - Internships
    {
      name: "LinkedIn (Internships)",
      priority: "high",
      role: "intern",
      scraper: (client, role) =>
        linkedinScraper.scrapeAllJobs(
          config.linkedin.timeFilters.threeDays,
          client,
          "comprehensive",
          role
        ),
      jobLimit: dailyConfig.jobLimits.linkedin,
    },
    {
      name: "GitHub (Internships)",
      priority: "high",
      role: "intern",
      scraper: (client, role) =>
        githubScraper.scrapeAllJobs(client, "comprehensive", role, "three_days"),
      jobLimit: dailyConfig.jobLimits.github,
    },

    // High Priority Sources - New Graduate/Entry Level
    {
      name: "LinkedIn (New Grad)",
      priority: "high",
      role: "new_grad",
      scraper: (client, role) =>
        linkedinScraper.scrapeAllJobs(
          config.linkedin.timeFilters.threeDays,
          client,
          "comprehensive",
          role
        ),
      jobLimit: dailyConfig.jobLimits.linkedin,
    },
    {
      name: "GitHub (New Grad)",
      priority: "high",
      role: "new_grad",
      scraper: (client, role) =>
        githubScraper.scrapeAllJobs(client, "comprehensive", role, "three_days"),
      jobLimit: dailyConfig.jobLimits.github,
    },

    // ZipRecruiter disabled - scraper is broken (0 jobs returned, likely site blocking)
    // Re-enable when scraping logic is fixed.

    // Low Priority Sources - Both roles (JobRight handles both internally)
    {
      name: "JobRight",
      priority: "low",
      role: "both",
      scraper: (client, role) =>
        jobrightScraper.scrapeAllJobs(client, "comprehensive", role, "three_days"),
      options: {
        skipMongoDedupe: true,
      },
      jobLimit: dailyConfig.jobLimits.jobright,
    },
  ];

  // Sort by priority
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  const tasksToUse = runOtherSourcesOnly ? otherSourceTasks : sourceTasks;
  tasksToUse.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  if (runOtherSourcesOnly) {
    loggerService.log(`🧪 RUN_OTHER_SOURCES_ONLY=true: LinkedIn, GitHub, JobRight OFF. Running only: ${tasksToUse.map((t) => t.name).join(", ")}`);
  }

  if (requestedRole !== "both") {
    loggerService.log(`🎯 Role filter enabled: ${requestedRole}`);
  }

  // Apply LinkedIn skip if set (tasksByRole used for role filtering below)
  let tasksByRole = tasksToUse;
  if (!runOtherSourcesOnly && skipLinkedIn) {
    tasksByRole = tasksToUse.filter(
      (task) => !(task.name || "").toLowerCase().includes("linkedin")
    );
    loggerService.log(`⏭️ LinkedIn disabled (SKIP_LINKEDIN=true). Running ${tasksByRole.length} sources: GitHub + JobRight only.`);
  }

  const filteredTasks =
    requestedRole === "both"
      ? tasksByRole
      : tasksByRole
          .filter(
            (task) => task.role === requestedRole || task.role === "both"
          )
          .map((task) => ({
            ...task,
            role: task.role === "both" ? requestedRole : task.role,
          }));

  loggerService.log(
    `📋 Running ${filteredTasks.length} sources with intelligent optimization...`
  );

  // Collect all jobs from all sources
  const allJobs = [];

  // Take a snapshot of ALL existing normalizedIds BEFORE scraping starts.
  // This prevents the race condition where scrapers add jobs to MongoDB
  // during their run, causing the outer dedup to treat them as "old".
  const preRunIds = await mongoService.getAllNormalizedIds();

  const dedupeContext = {
    enabled: true,
    seenNormalizedIds: new Set(),
    preRunIds, // snapshot of IDs that existed before this run
  };

  // Process by priority levels
  const priorityLevels = ["high", "medium", "low"];

  for (const priority of priorityLevels) {
    const priorityTasks = filteredTasks.filter(
      (task) => task.priority === priority
    );

    if (priorityTasks.length === 0) continue;

    loggerService.log(
      `🔥 Processing ${priorityTasks.length} ${priority}-priority sources...`
    );

    // Run scrapers for this priority level
    const priorityResults = await runParallelScraping(
      priorityTasks,
      priority,
      logChannel,
      client,
      { dedupeContext, discordSendQueue }
    );

    // Process results
    for (const result of priorityResults) {
      if (result.skipped) {
        results.skipped.push({
          name: result.name,
          priority: result.priority,
          role: result.role,
          reason: result.reason,
          jobsFound: result.jobsFound,
        });
        results.optimizationStats.sourcesSkipped++;
        results.optimizationStats.existingJobsReused += result.jobsFound;
      } else if (result.jobsFound > 0) {
        results.successful.push({
          name: result.name,
          priority: result.priority,
          role: result.role,
          jobsFound: result.jobsFound,
          duration: result.duration,
        });
        results.optimizationStats.sourcesScraped++;
        results.optimizationStats.newJobsFound += result.jobsFound;
      } else {
        results.failed.push({
          name: result.name,
          priority: result.priority,
          role: result.role,
          reason: result.reason,
        });
      }

      // Add source information to jobs
      const jobsWithSource = result.jobs.map((job) => ({
        ...job,
        source: result.name.toLowerCase(),
        role: job.role || result.role,
      }));

      allJobs.push(...jobsWithSource);
    }

    // Small delay between priority levels
    if (priority !== "low") {
      await delay(3000);
    }
  }

  // Process all collected jobs
  loggerService.log(
    `📊 Processing ${allJobs.length} total jobs from all sources...`
  );

  // Filter for relevant jobs - now include both intern and new grad roles
  // Skip curated sources (github, jobright) whose jobs are already
  // filtered at the scraper level and whose titles may not contain explicit
  // intern/new-grad keywords (e.g. GitHub job "Google - Software Engineer")
  // Use partial matching because task names include suffixes like "(New Grad)"
  const curatedSourcePrefixes = ["github", "jobright"];
  const relevantJobs = filterRelevantJobs(allJobs, requestedRole !== "both" ? requestedRole : "both", {
    skipSourceCheck: (source) =>
      curatedSourcePrefixes.some((prefix) =>
        (source || "").toLowerCase().startsWith(prefix)
      ),
  });
  loggerService.log(`✅ Filtered to ${relevantJobs.length} relevant jobs`);

  // Deduplicate jobs across all sources
  const uniqueJobs = deduplicateJobs(relevantJobs);
  loggerService.log(
    `🎯 Found ${uniqueJobs.length} unique jobs after deduplication`
  );

  // Use the pre-run snapshot for final daily dedup (same reason as per-source
  // dedup: scrapers add to MongoDB during the run, so live queries would
  // incorrectly filter out everything we just collected)
  const dailyUniqueJobs = uniqueJobs.filter((job) => {
    const nid = job.normalizedId || generateJobId(job);
    return !preRunIds.has(nid);
  });
  loggerService.log(
    `🧹 Filtered to ${dailyUniqueJobs.length} new jobs after daily dedupe`
  );

  results.totalJobsFound = dailyUniqueJobs.length;
  results.optimizationStats.newJobsFound = dailyUniqueJobs.length;

  // Calculate final statistics
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  const stats = await mongoService.getAllCacheStats();

  results.endTime = endTime;
  results.duration = duration;

  loggerService.log(
    `🎉 Optimized comprehensive scraping completed in ${duration} seconds`
  );
  loggerService.log(
    `📊 Results: ${results.successful.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`
  );
  loggerService.log(`📈 Total unique jobs found: ${uniqueJobs.length}`);
  loggerService.log(
    `⚡ Optimization: ${results.optimizationStats.sourcesSkipped} sources skipped, ${results.optimizationStats.existingJobsReused} existing jobs reused`
  );

  const postingStart = Date.now();
  if (logChannel) {
    const summaryMessages = createDailySummaryMessage(
      results,
      results.highQualityJobsCount || dailyUniqueJobs.length
    );

    for (const summaryMessage of summaryMessages) {
      await logChannel.send(summaryMessage);
      await delay(1000);
    }

    const jobMessages = createDiscordJobMessages(dailyUniqueJobs);
    for (const jobMsg of jobMessages) {
      await logChannel.send(jobMsg);
      await delay(1500);
    }

    if (results.failed.length > 0) {
      const errorDetails = results.failed
        .map((f) => `**${f.name}**: ${f.reason}`)
        .join("\n");

      if (errorDetails.length > 1900) {
        const truncatedError =
          errorDetails.substring(0, 1900) + "...\n*[Error details truncated]*";
        await logChannel.send(`❌ **Error Details:**\n${truncatedError}`);
      } else {
        await logChannel.send(`❌ **Error Details:**\n${errorDetails}`);
      }
    }
  }
  const postingDurationSec = Math.round((Date.now() - postingStart) / 1000);
  loggerService.log(`📤 Discord posting completed in ${postingDurationSec} seconds`);

  // Detailed end-of-run summary (time, errors, per-source counts and date range)
  const runEnd = new Date();
  const totalRunSec = Math.round((runEnd - startTime) / 1000);
  const bySource = {};
  for (const job of allJobs) {
    const src = job.source || "unknown";
    if (!bySource[src]) bySource[src] = { count: 0, dates: [] };
    bySource[src].count++;
    if (job.postedDate && String(job.postedDate).trim() && !/^n\/a$/i.test(String(job.postedDate))) {
      bySource[src].dates.push(String(job.postedDate).trim());
    }
  }
  const sourceLines = Object.entries(bySource).map(([name, data]) => {
    const dateRange = data.dates.length > 0
      ? ` (posted: ${[...new Set(data.dates)].slice(0, 3).join(", ")}${data.dates.length > 3 ? "…" : ""})`
      : "";
    return `  ${name}: ${data.count} jobs${dateRange}`;
  });
  loggerService.log("═══════════════════════════════════════════════════════════");
  loggerService.log("DAILY RUN SUMMARY");
  loggerService.log(`  Total duration: ${totalRunSec} seconds (scraping finished ~${Math.round((duration) / 60)} min in, Discord posting: ${postingDurationSec}s)`);
  loggerService.log(`  Successful: ${results.successful.length} | Failed: ${results.failed.length} | Skipped: ${results.skipped.length}`);
  if (results.failed.length > 0) {
    loggerService.log("  Errors:");
    results.failed.forEach((f) => loggerService.log(`    - ${f.name}: ${f.reason || "unknown"}`));
  }
  loggerService.log("  Per-source job counts (this run):");
  sourceLines.forEach((line) => loggerService.log(line));
  loggerService.log("  Date range covered: each source uses its own time filter (day / 3 days / week / month)");
  loggerService.log("═══════════════════════════════════════════════════════════");

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
  setShutdownClient(client);

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
        loggerService.log("Shutting down: closing MongoDB and Discord client...");
        await mongoService.close();
        try {
          await client.destroy();
        } catch (e) {
          loggerService.log(`Discord client destroy: ${e.message}`, "warn");
        }
        await new Promise((r) => setTimeout(r, 1500));
        process.exit(0);
      }
    });
  } catch (error) {
    loggerService.log(`Error starting scraper: ${error.message}`, "error");
    process.exit(1);
  }
}

// Handle graceful shutdown (close Mongo and Discord so process can exit)
let shutdownClient = null;
function setShutdownClient(c) {
  shutdownClient = c;
}
process.on("SIGINT", async () => {
  loggerService.log("Received SIGINT, shutting down gracefully...");
  await mongoService.close();
  if (shutdownClient) {
    try {
      await shutdownClient.destroy();
    } catch (e) {
      loggerService.log(`Discord destroy on SIGINT: ${e.message}`, "warn");
    }
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  loggerService.log("Received SIGTERM, shutting down gracefully...");
  await mongoService.close();
  if (shutdownClient) {
    try {
      await shutdownClient.destroy();
    } catch (e) {
      loggerService.log(`Discord destroy on SIGTERM: ${e.message}`, "warn");
    }
  }
  process.exit(0);
});

module.exports = {
  runComprehensiveScrape,
};

// Run the scraper only when executed directly
if (require.main === module) {
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
}
