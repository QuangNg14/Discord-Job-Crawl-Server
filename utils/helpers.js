const config = require("../config");

/**
 * Delay function for adding wait times between operations
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after the delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter job titles to ensure only software/data engineering related positions
 * @param {string} title - Job title to filter
 * @param {string} company - Company name (optional, for additional context)
 * @param {string} description - Job description (optional, for additional context)
 * @param {string} role - Role type: 'intern' or 'new grad' (optional, for role-specific filtering)
 * @returns {boolean} True if job should be included, false if filtered out
 */
function isRelevantJob(title, company = "", description = "", role = null) {
  if (!title || typeof title !== "string") {
    return false;
  }

  const titleLower = title.toLowerCase().trim();
  const companyLower = company.toLowerCase().trim();
  const descriptionLower = description.toLowerCase().trim();

  // Combine all text for comprehensive filtering
  const fullText = `${titleLower} ${companyLower} ${descriptionLower}`;

  // Role-specific filtering if role is specified
  if (role) {
    const isInternPosition =
      titleLower.includes("intern") || titleLower.includes("internship");
    const isNewGradPosition =
      titleLower.includes("new grad") ||
      titleLower.includes("entry level") ||
      titleLower.includes("graduate") ||
      titleLower.includes("junior") ||
      titleLower.includes("new graduate");

    if (role === "intern" && !isInternPosition) {
      console.log(
        `❌ Job filtered out (role mismatch): "${title}" - looking for intern roles only`
      );
      return false;
    }

    if (role === "new grad" && !isNewGradPosition && isInternPosition) {
      console.log(
        `❌ Job filtered out (role mismatch): "${title}" - looking for new grad roles only`
      );
      return false;
    }
  }

  // Check for specific software/data role indicators (immediate accept)
  const softwareDataIndicators = config.jobFiltering.softwareDataIndicators;
  for (const indicator of softwareDataIndicators) {
    if (titleLower.includes(indicator.toLowerCase())) {
      console.log(
        `✅ Job accepted (software/data indicator): "${title}" contains "${indicator}"`
      );
      return true;
    }
  }

  // Check for excluded keywords (immediate reject)
  const excludedKeywords = config.jobFiltering.excludedKeywords;
  for (const excluded of excludedKeywords) {
    if (fullText.includes(excluded.toLowerCase())) {
      console.log(
        `❌ Job filtered out (excluded keyword): "${title}" contains "${excluded}"`
      );
      return false;
    }
  }

  // Check if title contains at least one required keyword
  const requiredKeywords = config.jobFiltering.requiredKeywords;
  const hasRequiredKeyword = requiredKeywords.some((keyword) =>
    titleLower.includes(keyword.toLowerCase())
  );

  if (!hasRequiredKeyword) {
    console.log(`❌ Job filtered out (no required keywords): "${title}"`);
    return false;
  }

  // Additional specific filtering for common false positives
  const falsePositives = [
    "geotechnical engineer",
    "civil engineer",
    "mechanical engineer",
    "electrical engineer",
    "chemical engineer",
    "environmental engineer",
    "field engineer",
    "field service engineer",
    "field application engineer",
    "hardware engineer",
    "firmware engineer",
    "rf engineer",
    "analog engineer",
    "digital design engineer",
    "circuit protection",
    "water resources",
    "structural engineer",
    "transportation engineer",
    "construction engineer",
    "manufacturing engineer",
    "production engineer",
    "quality engineer",
    "process engineer",
    "project engineer",
    "sales engineer",
    "application engineer",
    "technical support engineer",
    "validation engineer",
    "test engineer",
    "maintenance engineer",
    "facility engineer",
    "building engineer",
    "operations engineer",
    "safety engineer",
    "compliance engineer",
    "regulatory engineer",
    "clinical engineer",
    "biomedical engineer",
    "materials engineer",
    "packaging engineer",
    "energy engineer",
    "power engineer",
    "control engineer",
    "instrumentation engineer",
    "automation engineer",
    "industrial engineer",
    "logistics engineer",
    "supply chain engineer",
  ];

  for (const falsePositive of falsePositives) {
    if (titleLower.includes(falsePositive)) {
      console.log(
        `❌ Job filtered out (false positive): "${title}" matches "${falsePositive}"`
      );
      return false;
    }
  }

  // If we get here, the job has required keywords and no excluded keywords
  console.log(`✅ Job accepted (passed filtering): "${title}"`);
  return true;
}

/**
 * Filter an array of jobs to only include relevant software/data engineering positions
 * @param {Array} jobs - Array of job objects with title, company, description properties
 * @param {string} role - Role type: 'intern' or 'new grad' (optional, for role-specific filtering)
 * @returns {Array} Filtered array of relevant jobs
 */
function filterRelevantJobs(jobs, role = null) {
  if (!Array.isArray(jobs)) {
    return [];
  }

  const filteredJobs = jobs.filter((job) => {
    if (!job || !job.title) {
      return false;
    }

    return isRelevantJob(
      job.title,
      job.company || "",
      job.description || "",
      role
    );
  });

  const roleText = role ? ` (${role} roles)` : "";
  console.log(
    `🔍 Job filtering${roleText}: ${jobs.length} total → ${
      filteredJobs.length
    } relevant (${jobs.length - filteredJobs.length} filtered out)`
  );
  return filteredJobs;
}

module.exports = {
  delay,
  isRelevantJob,
  filterRelevantJobs,
};
