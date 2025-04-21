const { MongoClient } = require("mongodb");
const fs = require("fs");
const config = require("../config");
const logger = require("./logger");

// MongoDB client
let mongoClient;
let db;
let collections = {};

// In-memory job caches for each source
const jobCaches = {
  linkedin: new Set(),
  simplyhired: new Set(),
  ziprecruiter: new Set(),
  careerjet: new Set(),
  jobright: new Set(),
  glassdoor: new Set(),
  dice: new Set(),
  github: new Set(),
};

// Connect to MongoDB
async function connect() {
  try {
    logger.log("Connecting to MongoDB...");
    mongoClient = new MongoClient(config.mongo.uri);
    await mongoClient.connect();
    db = mongoClient.db(config.mongo.dbName);

    // Initialize collections for each source
    collections.linkedin = db.collection(config.mongo.collections.linkedin);
    collections.simplyhired = db.collection(
      config.mongo.collections.simplyhired
    );
    collections.ziprecruiter = db.collection(
      config.mongo.collections.ziprecruiter
    );
    collections.careerjet = db.collection(config.mongo.collections.careerjet);
    collections.jobright = db.collection(config.mongo.collections.jobright);
    collections.glassdoor = db.collection(config.mongo.collections.glassdoor);
    collections.dice = db.collection(config.mongo.collections.dice);
    collections.github = db.collection(config.mongo.collections.github);

    // Create indexes for faster lookups
    await collections.linkedin.createIndex({ jobId: 1 }, { unique: true });
    await collections.simplyhired.createIndex({ jobId: 1 }, { unique: true });
    await collections.ziprecruiter.createIndex({ jobId: 1 }, { unique: true });
    await collections.careerjet.createIndex({ jobId: 1 }, { unique: true });
    await collections.jobright.createIndex({ jobId: 1 }, { unique: true });
    await collections.glassdoor.createIndex({ jobId: 1 }, { unique: true });
    await collections.dice.createIndex({ jobId: 1 }, { unique: true });
    await collections.github.createIndex({ jobId: 1 }, { unique: true });

    logger.log("Successfully connected to MongoDB");
    return true;
  } catch (error) {
    logger.log(`Error connecting to MongoDB: ${error.message}`, "error");
    return false;
  }
}

// Load job cache from MongoDB or fallback to file
async function loadCache() {
  try {
    await loadSourceCache("linkedin");
    await loadSourceCache("simplyhired");
    await loadSourceCache("ziprecruiter");
    await loadSourceCache("careerjet");
    await loadSourceCache("jobright");
    await loadSourceCache("glassdoor");
    await loadSourceCache("dice");
    await loadSourceCache("github");
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
    case "simplyhired":
      return config.simplyhired.fileCache;
    case "ziprecruiter":
      return config.ziprecruiter.fileCache;
    case "careerjet":
      return config.careerjet.fileCache;
    case "jobright":
      return config.jobright.fileCache;
    case "glassdoor":
      return config.glassdoor.fileCache;
    case "dice":
      return config.dice.fileCache;
    case "github":
      return config.github.fileCache;
    default:
      return `${source}-job-cache.json`;
  }
}

// Check if a job exists in the cache
function jobExists(jobId, source) {
  return jobCaches[source].has(jobId);
}

// Add multiple jobs to MongoDB cache
async function addJobs(jobs, source) {
  try {
    if (!jobs || jobs.length === 0) return 0;

    // Extract job IDs
    const jobIds = jobs.map((job) => job.id);

    // Always update in-memory cache
    jobIds.forEach((jobId) => jobCaches[source].add(jobId));

    // If MongoDB is connected, store there
    if (collections[source]) {
      const operations = jobs.map((job) => ({
        updateOne: {
          filter: { jobId: job.id },
          update: {
            $set: {
              jobId: job.id,
              timestamp: new Date(),
              title: job.title,
              company: job.company,
              location: job.location || "Not specified",
              url: job.url,
              postedDate: job.postedDate || "Not specified",
              description: job.description || "",
              metadata: job.metadata || "",
              source: job.source || source,
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
  await clearCache("simplyhired");
  await clearCache("ziprecruiter");
  await clearCache("careerjet");
  await clearCache("jobright");
  await clearCache("glassdoor");
  await clearCache("dice");
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
  const simplyhiredStats = await getCacheStats("simplyhired");
  const ziprecruiterStats = await getCacheStats("ziprecruiter");
  const careerjetStats = await getCacheStats("careerjet");
  const jobrightStats = await getCacheStats("jobright");
  const glassdoorStats = await getCacheStats("glassdoor");
  const diceStats = await getCacheStats("dice");
  const githubStats = await getCacheStats("github");

  return {
    linkedin: linkedinStats,
    simplyhired: simplyhiredStats,
    ziprecruiter: ziprecruiterStats,
    careerjet: careerjetStats,
    jobright: jobrightStats,
    glassdoor: glassdoorStats,
    dice: diceStats,
    github: githubStats,
    total:
      linkedinStats.count +
      simplyhiredStats.count +
      ziprecruiterStats.count +
      careerjetStats.count +
      jobrightStats.count +
      glassdoorStats.count +
      diceStats.count +
      githubStats.count,
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

module.exports = {
  connect,
  loadCache,
  jobExists,
  addJobs,
  clearCache,
  clearAllCaches,
  getCacheStats,
  getAllCacheStats,
  close,
  getJobsFromSource,
};
