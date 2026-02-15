#!/usr/bin/env node
// cleanupJobs.js - Clean up existing jobs in MongoDB cache to ensure only software/data engineering positions
require("dotenv").config();
const { MongoClient } = require("mongodb");
const config = require("./config");
const { isRelevantJob } = require("./utils/helpers");
const loggerService = require("./services/logger");

class JobCleanup {
  constructor() {
    this.mongoClient = null;
    this.db = null;
    this.collections = {};
    this.stats = {
      totalProcessed: 0,
      totalRemoved: 0,
      bySource: {},
    };
  }

  async connect() {
    try {
      loggerService.log("🔗 Connecting to MongoDB...");
      this.mongoClient = new MongoClient(config.mongo.uri);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(config.mongo.dbName);

      // Initialize all collections
      this.collections = {
        linkedin: this.db.collection(config.mongo.collections.linkedin),
        simplyhired: this.db.collection(config.mongo.collections.simplyhired),
        ziprecruiter: this.db.collection(config.mongo.collections.ziprecruiter),
        jobright: this.db.collection(config.mongo.collections.jobright),
        glassdoor: this.db.collection(config.mongo.collections.glassdoor),
        github: this.db.collection(config.mongo.collections.github),
      };

      loggerService.log("✅ Successfully connected to MongoDB");
      return true;
    } catch (error) {
      loggerService.log(
        `❌ Error connecting to MongoDB: ${error.message}`,
        "error"
      );
      return false;
    }
  }

  async getCollectionStats(collectionName) {
    try {
      const collection = this.collections[collectionName];
      const count = await collection.countDocuments();
      return count;
    } catch (error) {
      loggerService.log(
        `Error getting stats for ${collectionName}: ${error.message}`,
        "error"
      );
      return 0;
    }
  }

  async cleanupCollection(collectionName) {
    try {
      const collection = this.collections[collectionName];

      loggerService.log(`🧹 Cleaning up ${collectionName} collection...`);

      // Get initial count
      const initialCount = await collection.countDocuments();
      this.stats.bySource[collectionName] = {
        initial: initialCount,
        processed: 0,
        removed: 0,
        kept: 0,
      };

      if (initialCount === 0) {
        loggerService.log(
          `📭 ${collectionName} collection is empty, skipping...`
        );
        return;
      }

      loggerService.log(
        `📊 ${collectionName}: Processing ${initialCount} jobs...`
      );

      // Process jobs in batches to avoid memory issues
      const batchSize = 100;
      let skip = 0;
      let totalProcessed = 0;
      let totalRemoved = 0;

      const jobsToRemove = [];

      while (true) {
        // Get batch of jobs
        const jobs = await collection
          .find({})
          .skip(skip)
          .limit(batchSize)
          .toArray();

        if (jobs.length === 0) {
          break; // No more jobs to process
        }

        // Filter each job in the batch
        for (const job of jobs) {
          totalProcessed++;
          this.stats.totalProcessed++;
          this.stats.bySource[collectionName].processed++;

          // Apply filtering logic
          const isRelevant = isRelevantJob(
            job.title || "",
            job.company || "",
            job.description || ""
          );

          if (!isRelevant) {
            jobsToRemove.push(job._id);
            totalRemoved++;
            this.stats.totalRemoved++;
            this.stats.bySource[collectionName].removed++;

            loggerService.log(
              `🗑️  Marking for removal: "${job.title}" from ${
                job.company || "Unknown Company"
              }`
            );
          } else {
            this.stats.bySource[collectionName].kept++;
          }
        }

        skip += batchSize;

        // Progress update
        if (totalProcessed % 50 === 0) {
          loggerService.log(
            `📈 ${collectionName}: Processed ${totalProcessed}/${initialCount} jobs...`
          );
        }
      }

      // Remove irrelevant jobs in batches
      if (jobsToRemove.length > 0) {
        loggerService.log(
          `🗑️  Removing ${jobsToRemove.length} irrelevant jobs from ${collectionName}...`
        );

        const batchRemoveSize = 50;
        for (let i = 0; i < jobsToRemove.length; i += batchRemoveSize) {
          const batch = jobsToRemove.slice(i, i + batchRemoveSize);
          await collection.deleteMany({
            _id: { $in: batch },
          });

          if (i % 100 === 0) {
            loggerService.log(
              `🗑️  Removed ${Math.min(
                i + batchRemoveSize,
                jobsToRemove.length
              )}/${jobsToRemove.length} jobs...`
            );
          }
        }
      }

      const finalCount = await collection.countDocuments();

      loggerService.log(
        `✅ ${collectionName} cleanup complete: ${initialCount} → ${finalCount} jobs (${totalRemoved} removed)`
      );
    } catch (error) {
      loggerService.log(
        `❌ Error cleaning up ${collectionName}: ${error.message}`,
        "error"
      );
    }
  }

  async runCleanup() {
    try {
      loggerService.log("🚀 Starting MongoDB job cleanup process...");
      loggerService.log(
        "🎯 Filtering criteria: Must be software/data engineering related"
      );

      // Get initial statistics
      loggerService.log("\n📊 Initial Collection Statistics:");
      for (const [collectionName] of Object.entries(this.collections)) {
        const count = await this.getCollectionStats(collectionName);
        loggerService.log(`   ${collectionName}: ${count} jobs`);
      }

      loggerService.log("\n🧹 Starting cleanup process...\n");

      // Clean up each collection
      for (const collectionName of Object.keys(this.collections)) {
        await this.cleanupCollection(collectionName);

        // Add a small delay between collections to be gentle on the database
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Final statistics and summary
      await this.printFinalSummary();
    } catch (error) {
      loggerService.log(
        `❌ Error during cleanup process: ${error.message}`,
        "error"
      );
    }
  }

  async printFinalSummary() {
    loggerService.log("\n🎉 Cleanup Process Complete!\n");

    loggerService.log("📊 Final Collection Statistics:");
    let totalFinalJobs = 0;

    for (const [collectionName] of Object.entries(this.collections)) {
      const finalCount = await this.getCollectionStats(collectionName);
      const stats = this.stats.bySource[collectionName];
      totalFinalJobs += finalCount;

      if (stats) {
        loggerService.log(
          `   ${collectionName}: ${stats.initial} → ${finalCount} jobs (${stats.removed} removed, ${stats.kept} kept)`
        );
      } else {
        loggerService.log(`   ${collectionName}: ${finalCount} jobs`);
      }
    }

    loggerService.log(`\n📈 Overall Summary:`);
    loggerService.log(`   Total jobs processed: ${this.stats.totalProcessed}`);
    loggerService.log(`   Total jobs removed: ${this.stats.totalRemoved}`);
    loggerService.log(`   Total jobs remaining: ${totalFinalJobs}`);
    loggerService.log(
      `   Cleanup efficiency: ${(
        (this.stats.totalRemoved / this.stats.totalProcessed) *
        100
      ).toFixed(1)}% filtered out`
    );

    loggerService.log(
      "\n✅ All jobs now meet software/data engineering criteria!"
    );

    // Show examples of what types of jobs were kept
    loggerService.log("\n🎯 Filtering Criteria Applied:");
    loggerService.log(
      "   ✅ KEPT: Software Engineer, Data Engineer, Full Stack Developer, etc."
    );
    loggerService.log(
      "   ❌ REMOVED: Geotechnical Engineer, Field Engineer, Circuit Engineer, etc."
    );
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      loggerService.log("🔗 MongoDB connection closed");
    }
  }
}

// Main execution function
async function main() {
  const cleanup = new JobCleanup();

  try {
    // Connect to MongoDB
    const connected = await cleanup.connect();
    if (!connected) {
      loggerService.log("❌ Failed to connect to MongoDB. Exiting...", "error");
      process.exit(1);
    }

    // Run the cleanup process
    await cleanup.runCleanup();

    loggerService.log("\n🎉 Job cleanup completed successfully!");
  } catch (error) {
    loggerService.log(`❌ Cleanup failed: ${error.message}`, "error");
    process.exit(1);
  } finally {
    await cleanup.close();
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  loggerService.log("\n⚡ Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  loggerService.log("\n⚡ Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the cleanup if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { JobCleanup };
