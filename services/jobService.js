const mongoService = require("./mongo");
const logger = require("./logger");

async function getTopJobsFromAllSources(time = "day") {
  try {
    const allJobs = [];

    // Get jobs from each source
    const sources = [
      "linkedin",
      "simplyhired",
      "ziprecruiter",
      "careerjet",
      "jobright",
      "glassdoor",
      "dice",
      "github",
    ];

    for (const source of sources) {
      const jobs = await mongoService.getJobsFromSource(source, time);
      if (jobs && jobs.length > 0) {
        // Shuffle and take top 5
        const shuffled = jobs.sort(() => 0.5 - Math.random());
        allJobs.push(
          ...shuffled.slice(0, 5).map((job) => ({
            ...job,
            source,
          }))
        );
      }
    }

    // Shuffle all jobs and take top 5
    const shuffledAll = allJobs.sort(() => 0.5 - Math.random());
    return shuffledAll.slice(0, 5);
  } catch (error) {
    logger.log(`Error getting top jobs: ${error.message}`, "error");
    return [];
  }
}

module.exports = {
  getTopJobsFromAllSources,
};
