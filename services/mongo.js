const { MongoClient } = require("mongodb");
const fs = require("fs");
const config = require("../config");
const logger = require("./logger");
const { generateJobId } = require("../utils/helpers");

// MongoDB client
let mongoClient;
let db;
let collections = {};
let isConnected = false;

// In-memory job caches for each source
const jobCaches = {
  linkedin: new Set(),
  ziprecruiter: new Set(),
  jobright: new Set(),
  github: new Set(),
  simplyhired: new Set(),
  glassdoor: new Set(),
};

// Connect to MongoDB
async function connect() {
  try {
    logger.log("Connecting to MongoDB...");
    
    // Enhanced MongoDB connection options to handle SSL/TLS issues in containers
    const mongoOptions = {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeout || 15000,
      connectTimeoutMS: config.mongo.connectionTimeout || 15000,
      socketTimeoutMS: config.mongo.socketTimeout || 15000,
      retryWrites: config.mongo.retryWrites || true,
      retryReads: config.mongo.retryReads || true,
    };

    // TLS configuration for container environments (removed deprecated SSL options)
    if (config.mongo.tls) {
      mongoOptions.tls = config.mongo.tls;
      
      // Handle conflicting TLS options - prioritize tlsInsecure over tlsAllowInvalidCertificates
      if (config.mongo.tlsInsecure === true) {
        mongoOptions.tlsInsecure = true;
        // Don't set tlsAllowInvalidCertificates when tlsInsecure is true
      } else if (config.mongo.tlsAllowInvalidCertificates !== undefined) {
        mongoOptions.tlsAllowInvalidCertificates = config.mongo.tlsAllowInvalidCertificates;
      }
      
      if (config.mongo.tlsAllowInvalidHostnames !== undefined) {
        mongoOptions.tlsAllowInvalidHostnames = config.mongo.tlsAllowInvalidHostnames;
      }
    }

    // Log connection options for debugging (without sensitive data)
    logger.log(`MongoDB connection options: ${JSON.stringify({
      serverSelectionTimeoutMS: mongoOptions.serverSelectionTimeoutMS,
      connectTimeoutMS: mongoOptions.connectTimeoutMS,
      socketTimeoutMS: mongoOptions.socketTimeoutMS,
      retryWrites: mongoOptions.retryWrites,
      retryReads: mongoOptions.retryReads,
      tls: mongoOptions.tls,
      tlsAllowInvalidCertificates: mongoOptions.tlsAllowInvalidCertificates,
      tlsAllowInvalidHostnames: mongoOptions.tlsAllowInvalidHostnames,
      tlsInsecure: mongoOptions.tlsInsecure
    })}`);

    mongoClient = new MongoClient(config.mongo.uri, mongoOptions);
    await mongoClient.connect();
    db = mongoClient.db(config.mongo.dbName);

    // Initialize collections for each source
    collections.linkedin = db.collection(config.mongo.collections.linkedin);
    collections.ziprecruiter = db.collection(
      config.mongo.collections.ziprecruiter
    );
    collections.jobright = db.collection(config.mongo.collections.jobright);
    collections.github = db.collection(config.mongo.collections.github);
    if (config.mongo.collections.simplyhired) {
      collections.simplyhired = db.collection(config.mongo.collections.simplyhired);
    }
    if (config.mongo.collections.glassdoor) {
      collections.glassdoor = db.collection(config.mongo.collections.glassdoor);
    }

    // Create indexes for faster lookups
    await collections.linkedin.createIndex({ jobId: 1 }, { unique: true });
    await collections.ziprecruiter.createIndex({ jobId: 1 }, { unique: true });
    await collections.jobright.createIndex({ jobId: 1 }, { unique: true });
    await collections.github.createIndex({ jobId: 1 }, { unique: true });
    if (collections.simplyhired) await collections.simplyhired.createIndex({ jobId: 1 }, { unique: true });
    if (collections.glassdoor) await collections.glassdoor.createIndex({ jobId: 1 }, { unique: true });

    logger.log("Successfully connected to MongoDB");
    isConnected = true;
    return true;
  } catch (error) {
    logger.log(`Error connecting to MongoDB: ${error.message}`, "error");
    logger.log(`MongoDB URI: ${config.mongo.uri ? 'Set' : 'Not set'}`, "error");
    logger.log(`Database Name: ${config.mongo.dbName}`, "error");
    return false;
  }
}

// Load job cache from MongoDB or fallback to file
async function loadCache() {
  try {
    await loadSourceCache("linkedin");
    await loadSourceCache("ziprecruiter");
    await loadSourceCache("jobright");
    await loadSourceCache("github");
    if (collections.simplyhired) await loadSourceCache("simplyhired");
    if (collections.glassdoor) await loadSourceCache("glassdoor");
  } catch (error) {
    logger.log(`Error loading job caches: ${error.message}`, "error");
  }
}

// Load cache for a specific source
async function loadSourceCache(source) {
  try {
    // If MongoDB is connected, load from there
    if (collections[source]) {
      const jobs = await collections[source]
        .find({})
        .project({ jobId: 1, _id: 0 })
        .toArray();
      jobCaches[source] = new Set(jobs.map((job) => job.jobId));
      logger.log(
        `Loaded ${jobCaches[source].size} ${source} jobs from MongoDB cache.`
      );
    }
    // Fallback to file-based cache if MongoDB isn't available
    else {
      const cacheFile = getFileCachePath(source);
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, "utf8");
        const jobs = JSON.parse(data);
        jobCaches[source] = new Set(jobs);
        logger.log(
          `Loaded ${jobCaches[source].size} ${source} jobs from file cache (MongoDB unavailable).`
        );
      } else {
        logger.log(
          `No cache file found for ${source}. Starting with empty cache.`
        );
      }
    }
  } catch (error) {
    logger.log(`Error loading ${source} job cache: ${error.message}`, "error");
  }
}

// Get file cache path for a specific source
function getFileCachePath(source) {
  switch (source) {
    case "linkedin":
      return config.linkedin.fileCache;
    case "ziprecruiter":
      return config.ziprecruiter.fileCache;
    case "jobright":
      return config.jobright.fileCache;
    case "github":
      return config.github.fileCache;

    default:
      return `cache/${source}-job-cache.json`;
  }
}

// Check if a job exists in the cache
function jobExists(jobId, source) {
  const exists = jobCaches[source].has(jobId);
  if (config.debugMode) {
    logger.log(`Checking if job ${jobId} exists in ${source} cache: ${exists}`);
  }
  return exists;
}

// Check if a job exists by normalized ID (for cross-source deduplication)
async function jobExistsByNormalizedId(normalizedId) {
  try {
    // Check all collections for the normalized ID
    for (const [source, collection] of Object.entries(collections)) {
      if (collection) {
        const existingJob = await collection.findOne({ normalizedId });
        if (existingJob) {
          return { exists: true, source, job: existingJob };
        }
      }
    }
    return { exists: false, source: null, job: null };
  } catch (error) {
    logger.log(`Error checking normalized job ID: ${error.message}`, "error");
    return { exists: false, source: null, job: null };
  }
}

// Filter out jobs that already exist by normalized ID (title + company + location)
async function filterNewJobsByNormalizedId(jobs) {
  try {
    if (!jobs || jobs.length === 0) {
      return [];
    }

    const normalizedJobs = jobs.map((job) => {
      const normalizedId = job.normalizedId || generateJobId(job);
      return { ...job, normalizedId };
    });

    if (!collections || Object.keys(collections).length === 0) {
      return normalizedJobs;
    }

    const normalizedIds = [
      ...new Set(
        normalizedJobs
          .map((job) => job.normalizedId)
          .filter((id) => id && typeof id === "string")
      ),
    ];

    if (normalizedIds.length === 0) {
      return normalizedJobs;
    }

    const existingIds = new Set();
    const chunkSize = 500;

    for (let i = 0; i < normalizedIds.length; i += chunkSize) {
      const chunk = normalizedIds.slice(i, i + chunkSize);
      for (const collection of Object.values(collections)) {
        if (!collection) continue;
        const found = await collection
          .find({ normalizedId: { $in: chunk } })
          .project({ normalizedId: 1, _id: 0 })
          .toArray();
        found.forEach((doc) => existingIds.add(doc.normalizedId));
      }
    }

    return normalizedJobs.filter((job) => !existingIds.has(job.normalizedId));
  } catch (error) {
    logger.log(
      `Error filtering jobs by normalized ID: ${error.message}`,
      "error"
    );
    return jobs;
  }
}

// Get recent jobs from a specific source (within time range)
async function getRecentJobs(source, timeRange = "day") {
  try {
    if (!collections[source]) {
      return [];
    }

    const now = new Date();
    let startDate;

    switch (timeRange) {
      case "hour":
        startDate = new Date(now - 60 * 60 * 1000);
        break;
      case "day":
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 24 * 60 * 60 * 1000);
    }

    const recentJobs = await collections[source]
      .find({
        scrapedAt: { $gte: startDate }
      })
      .project({ jobId: 1, normalizedId: 1, title: 1, company: 1, location: 1, scrapedAt: 1 })
      .toArray();

    logger.log(`Found ${recentJobs.length} recent jobs in ${source} (${timeRange})`);
    return recentJobs;
  } catch (error) {
    logger.log(`Error getting recent jobs from ${source}: ${error.message}`, "error");
    return [];
  }
}

// Get all recent jobs across all sources
async function getAllRecentJobs(timeRange = "day") {
  try {
    const allRecentJobs = {};
    let totalRecentJobs = 0;

    for (const source of Object.keys(collections)) {
      const recentJobs = await getRecentJobs(source, timeRange);
      allRecentJobs[source] = recentJobs;
      totalRecentJobs += recentJobs.length;
    }

    logger.log(`Total recent jobs across all sources (${timeRange}): ${totalRecentJobs}`);
    return { allRecentJobs, totalRecentJobs };
  } catch (error) {
    logger.log(`Error getting all recent jobs: ${error.message}`, "error");
    return { allRecentJobs: {}, totalRecentJobs: 0 };
  }
}

// Check if we should skip scraping a source based on recent activity
async function shouldSkipSource(source, timeRange = "hour") {
  try {
    const recentJobs = await getRecentJobs(source, timeRange);
    const skipThreshold = config.dailyScraping?.skipThreshold || 10;
    
    if (recentJobs.length >= skipThreshold) {
      logger.log(`Skipping ${source} - found ${recentJobs.length} recent jobs (threshold: ${skipThreshold})`);
      return { shouldSkip: true, reason: `Found ${recentJobs.length} recent jobs`, recentCount: recentJobs.length };
    }
    
    return { shouldSkip: false, reason: "No recent jobs found", recentCount: recentJobs.length };
  } catch (error) {
    logger.log(`Error checking if should skip ${source}: ${error.message}`, "error");
    return { shouldSkip: false, reason: "Error occurred", recentCount: 0 };
  }
}

// Add multiple jobs to MongoDB cache
async function addJobs(jobs, source) {
  try {
    if (!jobs || jobs.length === 0) {
      logger.log(`No jobs to add for ${source}`);
      return 0;
    }

    const jobsWithNormalizedData = jobs.map((job) => {
      const normalizedTitle = (job.title || "").toLowerCase().trim();
      const normalizedCompany = (job.company || "").toLowerCase().trim();
      const normalizedLocation = (job.location || "").toLowerCase().trim();
      const normalizedId = job.normalizedId || generateJobId(job);
      return {
        ...job,
        normalizedId,
        normalizedTitle,
        normalizedCompany,
        normalizedLocation,
      };
    });

    logger.log(`Adding ${jobsWithNormalizedData.length} jobs to ${source} cache`);

    // Extract job IDs
    const jobIds = jobsWithNormalizedData.map((job) => job.id);

    // Always update in-memory cache
    jobIds.forEach((jobId) => jobCaches[source].add(jobId));

    logger.log(`Updated in-memory cache for ${source}. Total jobs in cache: ${jobCaches[source].size}`);

    // If MongoDB is connected, store there
    if (collections[source]) {
      const operations = jobsWithNormalizedData.map((job) => ({
        updateOne: {
          filter: { jobId: job.id },
          update: {
            $set: {
              // Required fields
              jobId: job.id,
              timestamp: new Date(),
              title: job.title || "Position details unavailable",
              company: job.company || "Company details unavailable",
              location: job.location || "Not specified",
              url: job.url || "",
              postedDate: job.postedDate || "Not specified",
              source: job.source || source,

              // Optional fields with defaults
              description: job.description || "",
              metadata: job.metadata || "",
              salary: job.salary || "",
              workModel: job.workModel || "",
              isPartnerListing: job.isPartnerListing || false,
              repoUrl: job.repoUrl || "",
              normalizedId: job.normalizedId || "",
              normalizedTitle: job.normalizedTitle || "",
              normalizedCompany: job.normalizedCompany || "",
              normalizedLocation: job.normalizedLocation || "",

              // Additional metadata for better organization
              scrapedAt: new Date(),
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }));

      await collections[source].bulkWrite(operations);
      logger.log(`Added ${jobIds.length} ${source} jobs to MongoDB cache.`);

      // Prune cache if it exceeds the maximum size
      await pruneCache(source);
    }
    // Fallback to file if MongoDB not available
    else {
      logger.log(`MongoDB not available, saving ${source} jobs to file cache`);
      saveToFile(source);
    }

    return jobIds.length;
  } catch (error) {
    logger.log(
      `Error adding ${source} jobs to cache: ${error.message}`,
      "error"
    );
    // Fall back to file-based storage if MongoDB fails
    saveToFile(source);
    return jobs.length;
  }
}

// Save cache to file (fallback)
function saveToFile(source) {
  try {
    const cacheFile = getFileCachePath(source);
    let jobs = Array.from(jobCaches[source]);

    // Limit cache size
    if (jobs.length > config.mongo.maxCacheSize) {
      jobs = jobs.slice(jobs.length - config.mongo.maxCacheSize);
      jobCaches[source] = new Set(jobs);
    }

    fs.writeFileSync(cacheFile, JSON.stringify(jobs), "utf8");
    logger.log(
      `Saved ${jobs.length} ${source} jobs to file cache (MongoDB fallback).`
    );
  } catch (error) {
    logger.log(
      `Error saving ${source} job cache to file: ${error.message}`,
      "error"
    );
  }
}

// Clear the job cache for a specific source
async function clearCache(source) {
  try {
    // Clear in-memory cache
    jobCaches[source].clear();

    // Clear MongoDB if connected
    if (collections[source]) {
      await collections[source].deleteMany({});
      logger.log(`MongoDB ${source} job cache cleared.`);
    }

    // Also clear file cache as fallback
    const cacheFile = getFileCachePath(source);
    fs.writeFileSync(cacheFile, JSON.stringify([]), "utf8");
    logger.log(`${source} job cache cleared (memory, MongoDB, and file).`);

    return true;
  } catch (error) {
    logger.log(`Error clearing ${source} job cache: ${error.message}`, "error");
    return false;
  }
}

// Clear all job caches
async function clearAllCaches() {
  await clearCache("linkedin");
  await clearCache("ziprecruiter");
  await clearCache("jobright");
  await clearCache("github");

  return true;
}

// Get cache statistics for a specific source
async function getCacheStats(source) {
  try {
    if (collections[source]) {
      const count = await collections[source].countDocuments();
      const oldestJob = await collections[source]
        .find({})
        .sort({ timestamp: 1 })
        .limit(1)
        .toArray();
      const newestJob = await collections[source]
        .find({})
        .sort({ timestamp: -1 })
        .limit(1)
        .toArray();

      return {
        count,
        source: "MongoDB",
        oldestJob: oldestJob.length > 0 ? oldestJob[0].timestamp : null,
        newestJob: newestJob.length > 0 ? newestJob[0].timestamp : null,
      };
    } else {
      return {
        count: jobCaches[source].size,
        source: "Memory/File",
        oldestJob: null,
        newestJob: null,
      };
    }
  } catch (error) {
    logger.log(
      `Error getting ${source} cache stats: ${error.message}`,
      "error"
    );
    return {
      count: jobCaches[source].size,
      source: "Memory/File (Error)",
      oldestJob: null,
      newestJob: null,
    };
  }
}

// Get cache statistics for all sources
async function getAllCacheStats() {
  const linkedinStats = await getCacheStats("linkedin");
  const ziprecruiterStats = await getCacheStats("ziprecruiter");
  const jobrightStats = await getCacheStats("jobright");
  const githubStats = await getCacheStats("github");
  const simplyhiredStats = collections.simplyhired ? await getCacheStats("simplyhired") : { count: 0, source: "N/A", oldestJob: null, newestJob: null };
  const glassdoorStats = collections.glassdoor ? await getCacheStats("glassdoor") : { count: 0, source: "N/A", oldestJob: null, newestJob: null };

  return {
    linkedin: linkedinStats,
    ziprecruiter: ziprecruiterStats,
    jobright: jobrightStats,
    github: githubStats,
    simplyhired: simplyhiredStats,
    glassdoor: glassdoorStats,
    total:
      linkedinStats.count +
      ziprecruiterStats.count +
      jobrightStats.count +
      githubStats.count +
      simplyhiredStats.count +
      glassdoorStats.count,
  };
}

// Prune old entries from MongoDB cache
async function pruneCache(source) {
  try {
    if (!collections[source]) {
      return;
    }

    const count = await collections[source].countDocuments();
    if (count <= config.mongo.maxCacheSize) {
      return;
    }

    // Find the timestamp of the Nth most recent document
    const cutoffDocs = await collections[source]
      .find({})
      .sort({ timestamp: -1 })
      .skip(config.mongo.maxCacheSize - 1)
      .limit(1)
      .toArray();

    if (cutoffDocs.length === 0) {
      return;
    }

    const cutoffTimestamp = cutoffDocs[0].timestamp;

    // Delete all documents older than the cutoff
    const deleteResult = await collections[source].deleteMany({
      timestamp: { $lt: cutoffTimestamp },
    });
    logger.log(
      `Pruned ${deleteResult.deletedCount} old entries from ${source} job cache.`
    );

    // Reload in-memory cache
    await loadSourceCache(source);
  } catch (error) {
    logger.log(`Error pruning ${source} cache: ${error.message}`, "error");
  }
}

// Close MongoDB connection
async function close() {
  if (mongoClient) {
    await mongoClient.close();
    isConnected = false;
    logger.log("MongoDB connection closed.");
  }
}

async function getJobsFromSource(source, time = "day") {
  try {
    const collection = db.collection(`${source}_jobs`);
    const now = new Date();
    let startDate;

    switch (time) {
      case "day":
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 24 * 60 * 60 * 1000);
    }

    const jobs = await collection
      .find({
        postedAt: { $gte: startDate },
      })
      .toArray();

    return jobs;
  } catch (error) {
    logger.log(`Error getting jobs from ${source}: ${error.message}`, "error");
    return [];
  }
}

/**
 * Get all existing normalizedIds from all collections.
 * Used to take a snapshot before scraping starts so that jobs added
 * during the current run are not falsely treated as "old".
 * @returns {Set<string>} Set of all known normalizedIds
 */
async function getAllNormalizedIds() {
  const ids = new Set();
  try {
    if (!collections || Object.keys(collections).length === 0) {
      return ids;
    }
    for (const [source, collection] of Object.entries(collections)) {
      if (!collection) continue;
      const docs = await collection
        .find({ normalizedId: { $exists: true, $ne: "" } })
        .project({ normalizedId: 1, _id: 0 })
        .toArray();
      docs.forEach((doc) => {
        if (doc.normalizedId) ids.add(doc.normalizedId);
      });
    }
    logger.log(`📸 Snapshot: ${ids.size} existing normalizedIds from MongoDB`);
  } catch (error) {
    logger.log(`Error getting all normalizedIds: ${error.message}`, "error");
  }
  return ids;
}

module.exports = {
  connect,
  loadCache,
  jobExists,
  jobExistsByNormalizedId,
  filterNewJobsByNormalizedId,
  getAllNormalizedIds,
  getRecentJobs,
  getAllRecentJobs,
  shouldSkipSource,
  addJobs,
  clearCache,
  clearAllCaches,
  getCacheStats,
  getAllCacheStats,
  close,
  getJobsFromSource,
  isConnected: () => isConnected,
};
