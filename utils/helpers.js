const crypto = require("crypto");
const { EmbedBuilder } = require("discord.js");
const loggerService = require("../services/logger");
const config = require("../config");

/**
 * Generate a unique job ID based on job data.
 * Two jobs are considered duplicates if they have the same company, same role title, and same location.
 * @param {object} job - Job object (title, company, location)
 * @returns {string} Unique job ID (MD5 of normalized title-company-location)
 */
function generateJobId(job) {
  const jobData = `${job.title || ""}-${job.company || ""}-${job.location || ""}`;
  return crypto.createHash("md5").update(jobData.toLowerCase().trim()).digest("hex");
}

/**
 * Normalize job data for better deduplication
 * @param {object} job - Job object
 * @returns {object} Normalized job object
 */
function normalizeJob(job) {
  return {
    ...job,
    title: (job.title || "").toLowerCase().trim(),
    company: (job.company || "").toLowerCase().trim(),
    location: (job.location || "").toLowerCase().trim(),
    normalizedId: job.normalizedId || generateJobId(job),
  };
}

/**
 * Deduplicate jobs across all sources
 * @param {Array} allJobs - Array of job objects from all sources
 * @returns {Array} Deduplicated jobs
 */
function deduplicateJobs(allJobs) {
  const seenJobs = new Map();
  const deduplicatedJobs = [];

  for (const job of allJobs) {
    const normalizedJob = normalizeJob(job);
    const jobId = normalizedJob.normalizedId;

    if (!seenJobs.has(jobId)) {
      // First time seeing this job
      seenJobs.set(jobId, {
        ...job,
        sources: [job.source],
        firstSeen: job.postedDate || new Date().toISOString(),
        normalizedId: jobId
      });
      deduplicatedJobs.push(seenJobs.get(jobId));
    } else {
      // Job already exists, add source if different
      const existingJob = seenJobs.get(jobId);
      if (!existingJob.sources.includes(job.source)) {
        existingJob.sources.push(job.source);
      }
      // Keep the earliest posted date
      if (job.postedDate && (!existingJob.firstSeen || job.postedDate < existingJob.firstSeen)) {
        existingJob.firstSeen = job.postedDate;
      }
    }
  }

  return deduplicatedJobs;
}

/**
 * Sort jobs by relevance and recency
 * @param {Array} jobs - Array of job objects
 * @returns {Array} Sorted jobs
 */
function sortJobsByRelevance(jobs) {
  return jobs.sort((a, b) => {
    // First, sort by number of sources (more sources = more relevant)
    const sourceDiff = (b.sources?.length || 1) - (a.sources?.length || 1);
    if (sourceDiff !== 0) return sourceDiff;

    // Then by posted date (newer first)
    const dateA = new Date(a.firstSeen || a.postedDate || 0);
    const dateB = new Date(b.firstSeen || b.postedDate || 0);
    return dateB - dateA;

    // Finally by title relevance (intern/new grad first)
    const titleA = (a.title || "").toLowerCase();
    const titleB = (b.title || "").toLowerCase();
    const internA = titleA.includes("intern");
    const internB = titleB.includes("intern");
    if (internA && !internB) return -1;
    if (!internA && internB) return 1;
  });
}

/**
 * Format job for Discord message
 * @param {object} job - Job object
 * @param {number} index - Job index
 * @returns {string} Formatted job string
 */
function formatJobForDiscord(job, index) {
  const title = job.title || "Unknown Position";
  const company = job.company || "Unknown Company";
  const location = job.location || "Remote";
  const sources = job.sources?.length > 1 ? ` (${job.sources.join(", ")})` : "";
  const date = job.firstSeen ? new Date(job.firstSeen).toLocaleDateString() : "Recent";
  
  // More concise format to fit more jobs per message
  return `${index}. **${title}** at ${company}${sources}\n   📍 ${location} | 📅 ${date}\n   🔗 ${job.url || "No link"}\n`;
}

/**
 * Split jobs into Discord-compatible messages
 * @param {Array} jobs - Array of job objects
 * @param {number} maxJobsPerMessage - Maximum jobs per message (default: 15)
 * @returns {Array} Array of message strings
 */
function createDiscordJobMessages(jobs, maxJobsPerMessage = 15) {
  const messages = [];
  const sortedJobs = sortJobsByRelevance(jobs);
  const maxCharsPerMessage = 1900; // Conservative limit for Discord

  let currentMessage = `**🎯 Daily Job Summary**\n`;
  currentMessage += `Found ${sortedJobs.length} unique jobs across all sources\n\n`;
  let jobCount = 0;
  let messageNumber = 1;

  for (let i = 0; i < sortedJobs.length; i++) {
    const job = sortedJobs[i];
    const jobText = formatJobForDiscord(job, i + 1);
    
    // Check if adding this job would exceed the limit
    if ((currentMessage + jobText).length > maxCharsPerMessage) {
      // Add footer to current message
      currentMessage += `\n*Showing ${jobCount} jobs (${sortedJobs.length} total)*`;
      messages.push(currentMessage.trim());
      
      // Start new message
      messageNumber++;
      currentMessage = `**🎯 Daily Job Summary (Continued ${messageNumber})**\n\n`;
      jobCount = 0;
    }
    
    currentMessage += jobText;
    jobCount++;
  }
  
  // Add the last message if there's content
  if (currentMessage.trim().length > 0) {
    currentMessage += `\n*Showing ${jobCount} jobs (${sortedJobs.length} total)*`;
    messages.push(currentMessage.trim());
  }

  return messages;
}

/**
 * Create a summary message for daily scraping results
 * @param {object} results - Scraping results
 * @param {number} totalUniqueJobs - Total unique jobs found
 * @returns {Array} Array of summary message strings (split if too long)
 */
function createDailySummaryMessage(results, totalUniqueJobs) {
  const successfulSources = results.successful?.length || 0;
  const failedSources = results.failed?.length || 0;
  const skippedSources = results.skipped?.length || 0;
  const duration = results.duration || 0;
  const optimizationStats = results.optimizationStats || {};

  let summary = `**📊 Optimized Daily Scraping Summary**\n\n`;
  summary += `✅ **${successfulSources}** sources scraped successfully\n`;
  summary += `⏭️ **${skippedSources}** sources skipped (optimization)\n`;
  summary += `❌ **${failedSources}** sources failed\n`;
  summary += `🎯 **${totalUniqueJobs}** unique jobs found\n`;
  summary += `🎓 **Job Types:** Internships & New Graduate/Entry Level\n`;
  summary += `⏱️ Completed in **${duration}** seconds\n\n`;

  // Add optimization statistics if available
  if (optimizationStats.sourcesSkipped > 0 || optimizationStats.existingJobsReused > 0) {
    summary += `**⚡ Optimization Results:**\n`;
    summary += `• ${optimizationStats.sourcesSkipped} sources skipped (recent jobs found)\n`;
    summary += `• ${optimizationStats.existingJobsReused} existing jobs reused\n`;
    summary += `• ${optimizationStats.newJobsFound} new jobs discovered\n`;
    summary += `\n`;
  }

  if (results.successful?.length > 0) {
    summary += `**✅ Successfully Scraped:**\n`;
    results.successful.forEach(source => {
      const durationText = source.duration ? ` (${source.duration}ms)` : '';
      const roleText = source.role ? ` [${source.role}]` : '';
      summary += `• ${source.name} (${source.priority})${roleText}${durationText}\n`;
    });
    summary += `\n`;
  }

  if (results.skipped?.length > 0) {
    summary += `**⏭️ Skipped (Optimization):**\n`;
    results.skipped.forEach(source => {
      const roleText = source.role ? ` [${source.role}]` : '';
      summary += `• ${source.name} (${source.priority})${roleText}: ${source.reason}\n`;
    });
    summary += `\n`;
  }

  if (results.failed?.length > 0) {
    summary += `**❌ Failed Sources:**\n`;
    results.failed.forEach(source => {
      const roleText = source.role ? ` [${source.role}]` : '';
      summary += `• ${source.name} (${source.priority})${roleText}: ${source.reason}\n`;
    });
  }

  // Split into multiple messages if too long
  const messages = [];
  const maxCharsPerMessage = 1900;
  
  if (summary.length <= maxCharsPerMessage) {
    messages.push(summary);
  } else {
    // Split the summary into multiple messages
    const lines = summary.split('\n');
    let currentMessage = '';
    
    for (const line of lines) {
      if ((currentMessage + line + '\n').length > maxCharsPerMessage) {
        if (currentMessage.trim()) {
          messages.push(currentMessage.trim());
        }
        currentMessage = line + '\n';
      } else {
        currentMessage += line + '\n';
      }
    }
    
    if (currentMessage.trim()) {
      messages.push(currentMessage.trim());
    }
  }

  return messages;
}

/**
 * Create individual source summary messages
 * @param {string} sourceName - Name of the source
 * @param {Array} jobs - Array of jobs from this source
 * @param {object} metadata - Additional metadata (duration, priority, etc.)
 * @returns {Array} Array of message strings (split if too long)
 */
function createSourceSummaryMessages(sourceName, jobs, metadata = {}) {
  const messages = [];
  const { duration, priority, skipped, reason, jobsFound, error } = metadata;
  
  // Create header message
  let headerMessage = `**🔍 ${sourceName} Scraping Complete**\n\n`;
  
  if (error) {
    headerMessage += `❌ **Failed**\n`;
    headerMessage += `💥 **Error:** ${error}\n`;
    if (duration) {
      headerMessage += `⏱️ **${duration}ms** processing time\n`;
    }
    if (priority) {
      headerMessage += `🎯 **${priority}** priority source\n`;
    }
    if (metadata.role) {
      const roleDisplay = metadata.role === "both" ? "Internships & New Grad" : 
                         metadata.role === "intern" ? "Internships" : 
                         metadata.role === "new_grad" ? "New Graduate" : metadata.role;
      headerMessage += `🎓 **${roleDisplay}** roles\n`;
    }
  } else if (skipped) {
    headerMessage += `⏭️ **Skipped** (Optimization)\n`;
    headerMessage += `📋 **${jobs.length}** existing jobs reused\n`;
    headerMessage += `💡 **Reason:** ${reason}\n`;
    if (metadata.role) {
      const roleDisplay = metadata.role === "both" ? "Internships & New Grad" : 
                         metadata.role === "intern" ? "Internships" : 
                         metadata.role === "new_grad" ? "New Graduate" : metadata.role;
      headerMessage += `🎓 **${roleDisplay}** roles\n`;
    }
  } else {
    headerMessage += `✅ **Successfully Scraped**\n`;
    headerMessage += `📊 **${jobs.length}** relevant jobs found\n`;
    if (jobsFound !== undefined) {
      headerMessage += `🆕 **${jobsFound}** new jobs added\n`;
    }
    if (duration) {
      headerMessage += `⏱️ **${duration}ms** processing time\n`;
    }
    if (priority) {
      headerMessage += `🎯 **${priority}** priority source\n`;
    }
    if (metadata.role) {
      const roleDisplay = metadata.role === "both" ? "Internships & New Grad" : 
                         metadata.role === "intern" ? "Internships" : 
                         metadata.role === "new_grad" ? "New Graduate" : metadata.role;
      headerMessage += `🎓 **${roleDisplay}** roles\n`;
    }
  }
  
  headerMessage += `\n`;
  
  // Check if header message is too long (Discord limit is 2000 characters)
  if (headerMessage.length > 1900) {
    messages.push(headerMessage.substring(0, 1900) + "...");
  } else {
    messages.push(headerMessage);
  }
  
  // If error or no jobs, return early
  if (error || !jobs || jobs.length === 0) {
    return messages;
  }
  
  // Create job listing messages with proper Discord character limit handling
  const sortedJobs = sortJobsByRelevance(jobs);
  const maxCharsPerMessage = 1900; // Conservative limit for Discord (2000 - buffer)
  
  let currentMessage = `**📋 ${sourceName} Jobs**\n\n`;
  let jobCount = 0;
  let messageNumber = 1;
  
  for (let i = 0; i < sortedJobs.length; i++) {
    const job = sortedJobs[i];
    const jobText = formatJobForDiscord(job, i + 1);
    
    // Check if adding this job would exceed the limit
    if ((currentMessage + jobText).length > maxCharsPerMessage) {
      // Add footer to current message
      currentMessage += `\n*${sourceName}: ${jobCount} jobs shown*`;
      messages.push(currentMessage.trim());
      
      // Start new message
      messageNumber++;
      currentMessage = `**📋 ${sourceName} Jobs (Continued ${messageNumber})**\n\n`;
      jobCount = 0;
    }
    
    currentMessage += jobText;
    jobCount++;
  }
  
  // Add the last message if there's content
  if (currentMessage.trim().length > 0) {
    currentMessage += `\n*${sourceName}: ${jobCount} jobs shown (${sortedJobs.length} total)*`;
    messages.push(currentMessage.trim());
  }
  
  return messages;
}

/**
 * Send source summary messages to Discord with proper rate limiting and channel routing
 * @param {object} channel - Discord channel object (legacy, will be overridden by routing)
 * @param {string} sourceName - Name of the source
 * @param {Array} jobs - Array of jobs from this source
 * @param {object} metadata - Additional metadata (should include client and role)
 * @param {function} delay - Delay function for rate limiting
 */
/**
 * Get the Discord channel object for a given role and category
 * @param {string} role - Role type: "intern" or "new_grad"
 * @param {string} category - Job category
 * @param {object} client - Discord client
 * @returns {Promise<object|null>} Discord channel object or null if not found
 */
async function getChannel(role, category, client) {
  if (!client) return null;
  
  const channelId = getChannelId(role, category, client);
  if (!channelId) return null;
  
  // Try cache first
  let channel = client.channels.cache.get(channelId);
  
  // If not in cache, try fetching (important for some environments)
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      // loggerService.log(`⚠️ Could not fetch channel ${channelId}: ${err.message}`, "warn");
    }
  }
  
  return channel;
}

/**
 * Send source summary messages to Discord with proper rate limiting and channel routing
 * @param {object} channel - Discord channel object (legacy, will be overridden by routing)
 * @param {string} sourceName - Name of the source
 * @param {Array} jobs - Array of jobs from this source
 * @param {object} metadata - Additional metadata (should include client and role)
 * @param {function} delay - Delay function for rate limiting
 */
async function sendSourceSummaryToDiscord(channel, sourceName, jobs, metadata = {}, delay) {
  const client = metadata.client;
  const defaultRole = metadata.role || "intern";
  const sourceLower = (sourceName || "").toLowerCase();
  
  if (!client) {
    loggerService.log(`⚠️ No Discord client provided for ${sourceName}, skipping Discord notification`, "warn");
    return;
  }
  
  try {
    // 1. ALWAYS send a summary to the LOG channel first
    const logChannel = await getChannel("log", "main", client);
    if (logChannel) {
      const statusEmoji = metadata.error ? "❌" : (metadata.skipped ? "⏭️" : "✅");
      const jobCount = jobs ? jobs.length : 0;
      let logMsg = `${statusEmoji} **${sourceName}** run complete. Found **${jobCount}** jobs.`;
      if (metadata.error) logMsg += `\nError: ${metadata.error}`;
      if (metadata.skipped) logMsg += `\nReason: ${metadata.reason}`;
      await logChannel.send(logMsg);
    }

    if (!jobs || jobs.length === 0) return;

    // 2. Route summaries to appropriate category channels
    const routedJobs = routeJobsToChannels(jobs, defaultRole);
    
    // Send summary to each channel
    for (const [routeKey, channelJobs] of routedJobs.entries()) {
      const [role, category] = routeKey.split("::");
      
      const targetChannel = await getChannel(role, category, client);
      
      if (!targetChannel) {
        loggerService.log(`⚠️ Could not find channel for ${routeKey}, skipping ${channelJobs.length} jobs summary`, "warn");
        continue;
      }
      
      // Create metadata for this specific route
      const routeMetadata = {
        ...metadata,
        role: role,
        category: category,
        jobsFound: channelJobs.length
      };
      
      // Create and send messages for this channel
      const messages = createSourceSummaryMessages(sourceName, channelJobs, routeMetadata);
      
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        
        // Validate message length before sending
        if (message.length > 2000) {
          loggerService.log(`⚠️ Message ${i + 1} for ${sourceName} (${routeKey}) exceeds Discord limit (${message.length} chars), truncating...`, "warn");
          const truncatedMessage = message.substring(0, 1900) + "...\n*[Message truncated due to length]*";
          await targetChannel.send(truncatedMessage);
        } else {
          await targetChannel.send(message);
        }
        
        // Rate limiting between messages
        if (i < messages.length - 1) {
          await delay(1500);
        }
      }
      
      loggerService.log(`✅ Sent ${messages.length} summary messages for ${sourceName} to ${routeKey} channel`);
    }
  } catch (error) {
    loggerService.log(`❌ Error sending ${sourceName} summary to Discord: ${error.message}`, "error");
  }
}

/**
 * Check if a job is relevant based on title, company, and description
 * @param {string} title - Job title
 * @param {string} company - Company name
 * @param {string} description - Job description
 * @param {string} role - Role type filter
 * @returns {boolean} Whether the job is relevant
 */
function isRelevantJob(title, company, description, role = null) {
  if (!title) {
    console.log("❌ Job filtered out (no title)");
    return false;
  }

  const titleLower = title.toLowerCase();
  const companyLower = (company || "").toLowerCase();
  const descriptionLower = (description || "").toLowerCase();

  // Skip only known aggregator/spam companies; allow "Unknown Company" / "Company not specified"
  // so scrapers (e.g. SimplyHired) that miss company/location still keep title-relevant jobs
  const excludedCompanies = ["jobright", "indeed", "ziprecruiter", "simplyhired", "glassdoor"];
  if (excludedCompanies.some((c) => companyLower.includes(c))) {
    console.log(`❌ Job filtered out (aggregator company): "${title}"`);
    return false;
  }

  // --- EXCLUDED KEYWORDS: only match against title (not description to avoid false positives) ---
  // Use word-boundary-aware matching for short keywords to prevent substring false positives
  const excludedExactTitle = [
    // Non-software engineering disciplines
    "geotechnical", "civil", "mechanical", "electrical", "chemical", "biomedical",
    "environmental", "nuclear", "petroleum", "mining", "construction",
    "hvac", "plumbing", "welding",
    "field service", "field engineer", "field technician",
    "process engineer", "project engineer", "design engineer", "sales engineer",
    "technical support engineer", "field application",
    "hardware engineer", "firmware engineer", "rf engineer",
    "analog engineer", "digital design engineer",
    "water resources", "structural", "urban planning", "surveying",
    "materials engineer", "metallurgical", "ceramic", "polymer", "textile",
    "food engineer", "agricultural", "forest engineer", "packaging engineer",
    "safety engineer", "regulatory engineer", "clinical engineer",
    "bioprocess", "pharmaceutical", "medical device", "laboratory",
    "research engineer", "operations engineer", "facility engineer",
    "building engineer", "energy engineer", "power engineer",
    "control engineer", "instrumentation", "automation engineer",
    "industrial engineer", "logistics engineer", "supply chain engineer",

    // Seniority / management (too senior for intern/new grad)
    "manager", "director", "principal", "senior", "staff",
    "consultant", "advisor",
    "product manager", "project manager", "program manager", "scrum master",
    "agile coach", "internship coordinator",

    // Non-tech roles
    "customer service", "help desk", "administrative", "clerical",
    "receptionist", "secretary",
    "teacher", "instructor", "professor", "educator",
    "writer", "editor", "journalist", "reporter",
    "nurse", "doctor", "physician", "healthcare",
    "lawyer", "attorney", "paralegal",
    "accountant", "bookkeeper",
    "chef", "cook", "restaurant", "hospitality", "hotel",
    "driver", "delivery", "warehouse", "inventory",
    "retail", "cashier", "store", "shop",
  ];

  for (const keyword of excludedExactTitle) {
    if (titleLower.includes(keyword)) {
      console.log(`❌ Job filtered out (excluded keyword "${keyword}"): "${title}"`);
      return false;
    }
  }

  // --- REQUIRED KEYWORDS: at least one must be present in title ---
  const requiredKeywords = [
    // Core software engineering
    "software engineer", "software developer", "software development",
    "swe", "sde",
    "frontend", "backend", "fullstack", "full-stack", "full stack",
    "web developer", "web development", "mobile developer", "app developer",
    "application developer", "systems engineer", "platform engineer",
    
    // Data engineering/science
    "data engineer", "data scientist", "data analyst", "data analytics",
    "machine learning", "ml engineer", "ai engineer", "artificial intelligence",
    "analytics engineer", "business intelligence", "bi engineer",
    
    // Business analysis
    "business analyst", "business analytics",
    
    // DevOps/Infrastructure
    "devops", "site reliability", "sre", "infrastructure engineer",
    "cloud engineer",
    
    // Cybersecurity
    "cybersecurity", "security engineer", "information security",
    
    // Emerging tech
    "blockchain", "fintech", "quantitative", "algorithm",
    
    // Entry level indicators (these count as required keywords too)
    "software", "developer", "engineer", "programmer", "coding",
    "data", "analyst",
  ];

  const hasRequiredKeyword = requiredKeywords.some(keyword => 
    titleLower.includes(keyword)
  );

  if (!hasRequiredKeyword) {
    console.log(`❌ Job filtered out (no required keywords): "${title}"`);
    return false;
  }

  // --- ROLE-SPECIFIC FILTERING ---
  const internKeywords = ["intern", "internship", "co-op", "coop", "student"];
  
  // Comprehensive new grad / entry-level detection patterns
  const newGradKeywords = [
    "new grad", "new graduate", "entry level", "entry-level",
    "junior", "recent graduate", "early career",
    "university grad", "university graduate", "college grad", "college graduate",
    "new college grad", "new college graduate",
    // Roman numeral / number level indicators (I, 1, 0)
    "engineer i", "engineer 1", "engineer 0",
    "developer i", "developer 1", "developer 0",
    "analyst i", "analyst 1", "analyst 0",
    "scientist i", "scientist 1", "scientist 0",
    // "Software Engineer I", "SDE I", etc.
    "sde i", "sde 1", "swe i", "swe 1",
    // "Associate" when used as a level indicator (Associate Software Engineer)
    "associate software", "associate data", "associate developer",
    "associate engineer", "associate analyst",
    // "Level 0", "Level 1", "Level I"
    "level 0", "level 1", "level i",
    // Common new grad title patterns
    "2025 start", "2026 start", "2025 grad", "2026 grad",
    "class of 2025", "class of 2026",
  ];

  // Also check with regex for patterns like "Software Engineer I" at end of title
  // or "Engineer I -" in middle of title
  const newGradRegexPatterns = [
    /\b(?:engineer|developer|analyst|scientist)\s+[i1]\b/i,
    /\b(?:engineer|developer|analyst|scientist)\s+[i1]\s*[-–—]/i,
    /\bengineer\s+[i1]\s*$/i,
    /\bdeveloper\s+[i1]\s*$/i,
    /\banalyst\s+[i1]\s*$/i,
    /\bscientist\s+[i1]\s*$/i,
  ];

  if (role === "intern") {
    const hasInternKeyword = internKeywords.some(keyword => titleLower.includes(keyword));
    if (!hasInternKeyword) {
      console.log(`❌ Job filtered out (not an intern position): "${title}"`);
      return false;
    }
  } else if (role === "new_grad") {
    const hasNewGradKeyword = newGradKeywords.some(keyword => titleLower.includes(keyword));
    const hasNewGradPattern = newGradRegexPatterns.some(regex => regex.test(title));
    if (!hasNewGradKeyword && !hasNewGradPattern) {
      console.log(`❌ Job filtered out (not a new grad position): "${title}"`);
      return false;
    }
  } else if (role === "both") {
    const hasInternKeyword = internKeywords.some(keyword => titleLower.includes(keyword));
    const hasNewGradKeyword = newGradKeywords.some(keyword => titleLower.includes(keyword));
    const hasNewGradPattern = newGradRegexPatterns.some(regex => regex.test(title));
    
    if (!hasInternKeyword && !hasNewGradKeyword && !hasNewGradPattern) {
      console.log(`❌ Job filtered out (not an intern or new grad position): "${title}"`);
      return false;
    }
  }

  console.log(`✅ Job accepted: "${title}"`);
  return true;
}

/**
 * Filter jobs based on relevance criteria
 * @param {Array} jobs - Array of job objects
 * @param {string} role - Role type filter
 * @param {object} options - Optional filtering options
 * @param {Array} options.skipSources - Sources to bypass relevance filtering (exact match)
 * @param {Function} options.skipSourceCheck - Function(source) => boolean to bypass relevance filtering
 * @returns {Array} Filtered jobs
 */
function filterRelevantJobs(jobs, role = null, options = {}) {
  if (!Array.isArray(jobs)) {
    console.log("❌ Invalid jobs array provided to filterRelevantJobs");
    return [];
  }

  const skipSources = Array.isArray(options.skipSources) ? options.skipSources : [];
  const skipSourceCheck = typeof options.skipSourceCheck === "function" ? options.skipSourceCheck : null;

  console.log(`🔍 Filtering ${jobs.length} jobs for role: ${role || "any"}`);

  const filteredJobs = jobs.filter(job => {
    // Check skip by exact source match (legacy)
    if (job?.source && skipSources.includes(job.source)) {
      return true;
    }
    // Check skip by callback (supports partial/prefix matching)
    if (job?.source && skipSourceCheck && skipSourceCheck(job.source)) {
      return true;
    }

    return isRelevantJob(
      job.title,
      job.company,
      job.description,
      role
    );
  });

  console.log(`✅ Filtered to ${filteredJobs.length} relevant jobs`);
  return filteredJobs;
}

/**
 * Filter jobs to only include those posted in the last day
 * @param {Array} jobs - Array of job objects
 * @param {string} timeFilter - Time filter ("day", "three_days", "week", "month")
 * @returns {Array} Filtered jobs from the specified time period
 */
function filterJobsByDate(jobs, timeFilter = "day") {
  if (!Array.isArray(jobs)) {
    console.log("❌ Invalid jobs array provided to filterJobsByDate");
    return [];
  }

  const now = new Date();
  let cutoffDate;

  switch (timeFilter) {
    case "day":
      // For "day" filter, we want jobs from today and yesterday
      // Set cutoff to start of yesterday
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      cutoffDate = yesterday;
      break;
    case "three_days":
    case "3_days":
      cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case "week":
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      break;
    case "month":
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      break;
    case "three_months":
    case "3_months":
    case "quarter":
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      break;
    default:
      // For "day" filter, we want jobs from today and yesterday
      const defaultYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      cutoffDate = defaultYesterday;
  }

  console.log(`🔍 Filtering ${jobs.length} jobs for posts since ${cutoffDate.toLocaleString()}`);

  let unparseableDateLogged = false;
  const filteredJobs = jobs.filter(job => {
    // Try to parse the posted date
    let jobDate;

    if (job.postedDate) {
      // Handle various date formats
      if (typeof job.postedDate === 'string') {
        // Try to parse common date formats
        const dateStr = job.postedDate.toLowerCase().trim();

        // Skip empty or invalid date strings
        if (!dateStr || dateStr === '' || dateStr === 'n/a' || dateStr === 'unknown') {
          return true;
        }

        // "Just posted", "Today" -> treat as now (include)
        if (/^just\s*posted|^today$/i.test(dateStr)) {
          jobDate = new Date();
        }
        // "Yesterday"
        else if (/^yesterday$/i.test(dateStr)) {
          jobDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
        }
        // "Hiring ongoing" / "Ongoing" -> include (treat as recent)
        else if (/hiring\s*ongoing|ongoing$/i.test(dateStr)) {
          jobDate = new Date();
        }
        // "30+ days ago" or "N days ago" with optional +
        else if (dateStr.includes('ago') && dateStr.match(/(\d+)\s*\+\s*days?\s*ago/i)) {
          const timeMatch = dateStr.match(/(\d+)\s*\+\s*days?\s*ago/i);
          const amount = parseInt(timeMatch[1], 10);
          jobDate = new Date(now.getTime() - Math.min(amount, 90) * 24 * 60 * 60 * 1000);
        }
        // Handle GitHub age format (0d, 1d, 2d, 9d, etc.)
        else if (dateStr.match(/^\d+d$/)) {
          const timeMatch = dateStr.match(/^(\d+)d$/);
          if (timeMatch) {
            const amount = parseInt(timeMatch[1]);
            jobDate = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
          }
        }
        // Handle GitHub age format with "mo" (1mo, 2mo, 3mo, etc.)
        else if (dateStr.match(/^\d+mo$/)) {
          const timeMatch = dateStr.match(/^(\d+)mo$/);
          if (timeMatch) {
            const amount = parseInt(timeMatch[1]);
            jobDate = new Date(now.getTime() - amount * 30 * 24 * 60 * 60 * 1000);
          }
        }
        // Handle "m" shorthand (1m, 2m, 3m, etc.)
        else if (dateStr.match(/^\d+m$/)) {
          const timeMatch = dateStr.match(/^(\d+)m$/);
          if (timeMatch) {
            const amount = parseInt(timeMatch[1]);
            jobDate = new Date(now.getTime() - amount * 30 * 24 * 60 * 60 * 1000);
          }
        }
        // Handle relative dates like "2 hours ago", "1 day ago", "30+ days ago", etc.
        else if (dateStr.includes('ago')) {
          const timeMatch = dateStr.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
          if (timeMatch) {
            const amount = parseInt(timeMatch[1]);
            const unit = timeMatch[2].toLowerCase();
            
            switch (unit) {
              case 'hour':
                jobDate = new Date(now.getTime() - amount * 60 * 60 * 1000);
                break;
              case 'day':
                jobDate = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
                break;
              case 'week':
                jobDate = new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
                break;
              case 'month':
                jobDate = new Date(now.getTime() - amount * 30 * 24 * 60 * 60 * 1000);
                break;
            }
          }
        }
        // Handle JobRight date format like "Aug 24", "Aug 23"
        else if (dateStr.match(/^[A-Za-z]{3}\s+\d{1,2}$/)) {
          const monthMap = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
          
          const dateMatch = dateStr.toLowerCase().match(/(\w{3})\s+(\d+)/);
          if (dateMatch) {
            const month = monthMap[dateMatch[1]];
            const day = parseInt(dateMatch[2]);
            
            if (month !== undefined && !isNaN(day)) {
              // Create date at start of day to avoid time comparison issues
              jobDate = new Date(now.getFullYear(), month, day, 0, 0, 0, 0);
            }
          }
        } else {
          // Try to parse as a regular date
          jobDate = new Date(job.postedDate);
        }
      } else if (job.postedDate instanceof Date) {
        jobDate = job.postedDate;
      }
    }
    
    // If we couldn't parse the date, include the job (don't filter out)
    if (!jobDate || isNaN(jobDate.getTime())) {
      if (!unparseableDateLogged) {
        console.log(`⚠️ Could not parse date for job: "${job.title}" - including it (further unparseable dates in this batch not logged)`);
        unparseableDateLogged = true;
      }
      return true;
    }
    
    // Check if job was posted after the cutoff date
    const isRecent = jobDate >= cutoffDate;
    
    if (!isRecent) {
      console.log(`❌ Job filtered out (too old): "${job.title}" - posted ${jobDate.toLocaleDateString()}`);
    }
    
    return isRecent;
  });

  console.log(`✅ Filtered to ${filteredJobs.length} recent jobs (posted in last ${timeFilter})`);
  return filteredJobs;
}

/**
 * Categorize a job into one of: software_engineering, data_analysis, data_science_engineer
 * @param {object} job - Job object with title, description, etc.
 * @returns {string} Category name
 */
function categorizeJob(job) {
  const title = (job.title || "").toLowerCase();
  const description = (job.description || "").toLowerCase();
  const company = (job.company || "").toLowerCase();
  const combinedText = `${title} ${description} ${company}`;
  
  // Check for data science/engineering keywords first (more specific)
  const dataScienceKeywords = [
    "data scientist", "data science", "machine learning", "ml engineer",
    "ai engineer", "artificial intelligence", "deep learning", "neural network",
    "data engineer", "analytics engineer", "mlops", "data platform engineer",
    "nlp", "computer vision", "cv engineer", "quant engineer", "quantitative engineer",
    "research scientist", "applied scientist", "ai/ml", "machine learning engineer"
  ];
  
  // Check for data analysis keywords
  const dataAnalysisKeywords = [
    "data analyst", "data analytics", "business analyst", "business analytics",
    "business intelligence", "bi analyst", "analyst", "quantitative analyst",
    "product analyst", "marketing analyst", "operations analyst"
  ];
  
  // Check for software engineering keywords
  const softwareKeywords = [
    "software engineer", "software developer", "software development",
    "frontend", "backend", "fullstack", "full-stack", "full stack",
    "web developer", "web development", "mobile developer", "app developer",
    "application developer", "systems engineer", "platform engineer",
    "devops", "site reliability", "sre", "infrastructure engineer",
    "cloud engineer", "systems administrator"
  ];
  
  // Title-based matching takes priority - check title first for accurate categorization
  // This ensures jobs like "Data Scientist" from a "Data Analysis" repo go to the right channel
  
  // Check for data science/engineering first (most specific)
  const matchedDS = dataScienceKeywords.find(keyword => title.includes(keyword));
  if (matchedDS) {
    loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_science_engineer (title matched: "${matchedDS}")`);
    return "data_science_engineer";
  }
  
  // Check for data analysis in title
  const matchedDA = dataAnalysisKeywords.find(keyword => title.includes(keyword));
  if (matchedDA) {
    loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_analysis (title matched: "${matchedDA}")`);
    return "data_analysis";
  }
  
  // Check for software engineering in title
  if (softwareKeywords.some(keyword => title.includes(keyword))) {
    return "software_engineering";
  }
  
  // If title didn't match, use explicit category from metadata (e.g., GitHub section headers)
  const jobCategory = job.category || job.repoCategory;
  if (jobCategory) {
    if (jobCategory === "data_analysis" || jobCategory === "business_analyst") {
      loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_analysis (metadata: ${jobCategory})`);
      return "data_analysis";
    }
    if (jobCategory === "software_engineering") return "software_engineering";
    if (jobCategory === "data_science_engineer") {
      loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_science_engineer (metadata: ${jobCategory})`);
      return "data_science_engineer";
    }
  }
  
  // Fallback: check description + company text for broader matching
  if (dataScienceKeywords.some(keyword => combinedText.includes(keyword))) {
    loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_science_engineer (description match)`);
    return "data_science_engineer";
  }
  
  if (dataAnalysisKeywords.some(keyword => combinedText.includes(keyword))) {
    loggerService.log(`📂 categorizeJob: "${(job.title || "").substring(0, 60)}" -> data_analysis (description match)`);
    return "data_analysis";
  }
  
  if (softwareKeywords.some(keyword => combinedText.includes(keyword))) {
    return "software_engineering";
  }
  
  // Default to software_engineering if no match (most common category)
  return "software_engineering";
}

/**
 * Get the Discord channel ID for a given role and category
 * @param {string} role - Role type: "intern" or "new_grad"
 * @param {string} category - Job category: "software_engineering", "data_analysis", or "data_science_engineer"
 * @param {object} client - Discord client (optional, for fallback)
 * @returns {string|null} Channel ID or null if not found
 */
function getChannelId(role, category, client = null) {
  // Normalize role
  const normalizedRole = role === "new_grad" ? "new_grad" : "intern";
  
  // Get channel ID from config
  const channelId =
    role === "log"
      ? config.logChannelId
      : config.channels?.[normalizedRole]?.[category] || null;
  
  if (!channelId) {
    loggerService.log(`⚠️ No channel ID found for role: ${normalizedRole}, category: ${category}`, "warn");
    return null;
  }
  
  return channelId;
}

// NOTE: getChannel is defined above (async version with fetch fallback).
// The synchronous version that was here has been removed to prevent
// the duplicate declaration from overwriting the async one.

/**
 * Route jobs to appropriate channels based on role and category
 * Groups jobs by role + category and returns a map
 * @param {Array} jobs - Array of job objects
 * @param {string} defaultRole - Default role if not specified in job
 * @returns {Map} Map of "role_category" -> jobs array
 */
function routeJobsToChannels(jobs, defaultRole = "intern") {
  const routedJobs = new Map();
  
  for (const job of jobs) {
    // Determine role from job (prefer specific role) or use default
    let role = job.role || defaultRole;
    
    // If role is still "both" or not specifically intern/new_grad, try to detect from title
    if (role === "both" || (role !== "intern" && role !== "new_grad")) {
      const title = (job.title || "").toLowerCase();
      const internKeywords = ["intern", "internship", "co-op", "coop", "student"];
      const newGradKeywords = [
        "new grad", "new graduate", "entry level", "entry-level",
        "junior", "recent graduate", "early career",
        "university grad", "university graduate", "college grad", "college graduate",
        "new college grad", "new college graduate",
        "engineer i", "engineer 1", "engineer 0",
        "developer i", "developer 1", "developer 0",
        "analyst i", "analyst 1", "analyst 0",
        "scientist i", "scientist 1", "scientist 0",
        "sde i", "sde 1", "swe i", "swe 1",
        "associate software", "associate data", "associate developer",
        "associate engineer", "associate analyst",
        "level 0", "level 1", "level i",
      ];
      
      if (internKeywords.some(keyword => title.includes(keyword))) {
        role = "intern";
      } else if (newGradKeywords.some(keyword => title.includes(keyword))) {
        role = "new_grad";
      } else {
        // Use defaultRole if we can't determine from title
        role = defaultRole === "both" ? "intern" : defaultRole;
      }
    }
    
    // Categorize the job
    const category = categorizeJob(job);
    
    // Create key for routing
    const routeKey = `${role}::${category}`;
    
    // Add job to appropriate route
    if (!routedJobs.has(routeKey)) {
      routedJobs.set(routeKey, []);
    }
    routedJobs.get(routeKey).push(job);
  }
  
  // Log routing summary for diagnostics
  for (const [routeKey, channelJobs] of routedJobs.entries()) {
    loggerService.log(`📬 Route ${routeKey}: ${channelJobs.length} jobs`);
  }
  
  return routedJobs;
}

/**
 * Get embed color for a source
 * @param {string} sourceName - Name of the source
 * @returns {number} Color code
 */
function getSourceEmbedColor(sourceName) {
  const sourceLower = (sourceName || "").toLowerCase();
  if (sourceLower.includes("linkedin")) return 0x0077b5;
  if (sourceLower.includes("github")) return config.github?.embedColor ? parseInt(config.github.embedColor.replace("#", "0x")) : 0x1e90ff;
  if (sourceLower.includes("ziprecruiter")) return config.ziprecruiter?.embedColor ? parseInt(config.ziprecruiter.embedColor.replace("#", "0x")) : 0x1e90ff;
  if (sourceLower.includes("jobright")) return config.jobright?.embedColor ? parseInt(config.jobright.embedColor.replace("#", "0x")) : 0x1e90ff;
  return 0x0077b5; // Default LinkedIn blue
}

/**
 * Send jobs to Discord channels with proper routing based on role and category
 * @param {Array} jobs - Array of job objects
 * @param {object} client - Discord client
 * @param {string} sourceName - Name of the source
 * @param {string} defaultRole - Default role if not specified in job
 * @param {function} delay - Delay function for rate limiting
 */
async function sendJobsToDiscord(jobs, client, sourceName, defaultRole = "intern", delay) {
  if (!client || !jobs || jobs.length === 0) return;
  
  try {
    // Route jobs to appropriate channels (6 channels: 3 intern + 3 new_grad)
    const routedJobs = routeJobsToChannels(jobs, defaultRole);
    const embedColor = getSourceEmbedColor(sourceName);

    // Discord: max 10 embeds per message; stay under rate limits by round-robin across channels
    const EMBEDS_PER_MESSAGE = 10;
    const DELAY_BETWEEN_MESSAGES_MS = config.discordSerialization?.delayBetweenMessagesMs ?? 2000;

    // Build per-channel data: header + batches
    const channelSends = [];
    for (const [routeKey, channelJobs] of routedJobs.entries()) {
      const [role, category] = routeKey.split("::");
      const targetChannel = await getChannel(role, category, client);
      if (!targetChannel) {
        loggerService.log(`⚠️ Could not find channel for ${routeKey}, skipping ${channelJobs.length} jobs`, "warn");
        continue;
      }
      const validJobs = channelJobs.filter((j) => j.title && j.url);
      const batches = [];
      for (let i = 0; i < validJobs.length; i += EMBEDS_PER_MESSAGE) {
        batches.push(validJobs.slice(i, i + EMBEDS_PER_MESSAGE));
      }
      channelSends.push({
        routeKey,
        channel: targetChannel,
        role,
        category,
        totalCount: validJobs.length,
        batches,
      });
    }

    // Send header to each channel first (one per channel, with delay)
    for (const entry of channelSends) {
      try {
        await entry.channel.send(
          `**${sourceName}** - ${entry.totalCount} new ${entry.role === "intern" ? "internship" : "new grad"} posting${entry.totalCount !== 1 ? "s" : ""} (${entry.category.replace("_", " ")})`
        );
        await delay(DELAY_BETWEEN_MESSAGES_MS);
      } catch (err) {
        loggerService.log(`Error sending header to ${entry.routeKey}: ${err.message}`, "error");
      }
    }

    // Round-robin: send one batch from each channel in turn to spread load and stay under limits
    let roundIndex = 0;
    let sentPerChannel = {};
    channelSends.forEach((e) => { sentPerChannel[e.routeKey] = 0; });

    while (true) {
      let anySent = false;
      for (const entry of channelSends) {
        if (roundIndex >= entry.batches.length) continue;
        const batch = entry.batches[roundIndex];
        const embeds = batch.map((job) =>
          new EmbedBuilder()
            .setTitle(job.title)
            .setURL(job.url)
            .setColor(embedColor)
            .setDescription(job.company || "Company not specified")
            .addFields(
              { name: "Location", value: job.location || "Not specified", inline: true },
              { name: "Posted", value: job.postedDate || "Recent", inline: true }
            )
            .setFooter({
              text: `Source: ${sourceName} | ID: ${job.id ? job.id.substring(0, 10) : "unknown"}`,
            })
        );
        try {
          await entry.channel.send({ embeds });
          sentPerChannel[entry.routeKey] += batch.length;
          anySent = true;
          await delay(DELAY_BETWEEN_MESSAGES_MS);
        } catch (err) {
          loggerService.log(`Error sending job batch to Discord (${entry.routeKey}): ${err.message}`, "error");
        }
      }
      if (!anySent) break;
      roundIndex++;
    }

    for (const [routeKey, count] of Object.entries(sentPerChannel)) {
      loggerService.log(`✅ Sent ${count} jobs to Discord channel ${routeKey}`);
    }
  } catch (error) {
    loggerService.log(`Error sending jobs to Discord: ${error.message}`, "error");
  }
}

/**
 * Delay function for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  generateJobId,
  normalizeJob,
  deduplicateJobs,
  sortJobsByRelevance,
  formatJobForDiscord,
  createDiscordJobMessages,
  createDailySummaryMessage,
  createSourceSummaryMessages,
  sendSourceSummaryToDiscord,
  isRelevantJob,
  filterRelevantJobs,
  filterJobsByDate,
  categorizeJob,
  getChannelId,
  getChannel,
  routeJobsToChannels,
  sendJobsToDiscord,
  delay
};
