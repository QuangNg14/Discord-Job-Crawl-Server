// Global configuration for the job scraping bot
module.exports = {
  // Discord configuration
  logChannelId: process.env.CHANNEL_ID_LOG || process.env.CHANNEL_ID, // Channel for logs and summaries
  startupChannelId: process.env.CHANNEL_ID_STARTUP, // Channel for startup jobs
  debugMode: false, // Disable debug mode for production efficiency

  // Multi-channel configuration for role + category routing
  // Format: channels[role][category] = channelId
  channels: {
    intern: {
      software_engineering: process.env.CHANNEL_ID_INTERN_SOFTWARE,
      data_analysis: process.env.CHANNEL_ID_INTERN_DATA_ANALYSIS,
      data_science_engineer: process.env.CHANNEL_ID_INTERN_DATA_SCIENCE,
    },
    new_grad: {
      software_engineering: process.env.CHANNEL_ID_NEWGRAD_SOFTWARE,
      data_analysis: process.env.CHANNEL_ID_NEWGRAD_DATA_ANALYSIS,
      data_science_engineer: process.env.CHANNEL_ID_NEWGRAD_DATA_SCIENCE,
    },
  },

  // Main scraping schedule (for all job sources)
  scrapingSchedule: "0 14 * * *", // Daily at 2:00 PM EST (cron format)

  // Daily comprehensive scraping configuration
  dailyScraping: {
    enabled: true,
    schedule: "0 14 * * *", // Daily at 2:00 PM EST
    timeFilter: "day", // Focus on jobs posted in the last 24 hours
    mode: "comprehensive", // Use comprehensive mode for thorough scraping

    // Optimization settings for faster scraping
    optimization: {
      enabled: true,
      skipThreshold: 10, // Skip source if it has >= 10 recent jobs in the last hour
      maxRecentJobsCheck: 50, // Maximum jobs to check for recent activity
      cacheTimeRange: "hour", // Time range to check for recent jobs (hour, day, week)
      parallelScraping: true, // Enable parallel scraping for non-dependent sources
      maxConcurrentSources: 2, // Limit concurrent scrapers to reduce load
      staggerStartMs: 1500, // Stagger scraper starts to avoid bursts
      discordSequentialSend: true, // Serialize Discord sends across sources
      intelligentSkipping: true, // Skip sources that were recently scraped successfully
      reuseExistingJobs: true, // Include existing jobs from cache in results
    },

    priority: {
      high: ["linkedin", "github"], // Most important sources
      medium: ["ziprecruiter"], // Secondary sources
      low: ["jobright", "wellfound"], // Additional sources
    },
    jobLimits: {
      linkedin: 150, // Higher limit for LinkedIn (most important) - increased for both roles
      github: 200, // Higher limit for GitHub repos - increased for both roles
      ziprecruiter: 80, // Reduced for efficiency - 8 keywords × 5 locations × 2 roles
      jobright: 100, // Increased for both roles
      wellfound: 120, // Startup jobs across roles/locations
    },
    notifications: {
      start: true, // Notify when scraping starts
      completion: true, // Notify when scraping completes
      errors: true, // Notify on errors
      summary: true, // Send daily summary
    },
  },

  // MongoDB configuration
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017",
    dbName: process.env.DB_NAME || "job_scraper_bot",
    collections: {
      linkedin: "linkedin_jobs",
      ziprecruiter: "ziprecruiter_jobs",
      jobright: "jobright_jobs",
      github: "github_jobs",
      wellfound: "wellfound_jobs",
    },
    maxCacheSize: 5000, // Maximum number of jobs to keep in cache per source - increased for comprehensive scraping
    // Connection settings
    connectionTimeout: 15000, // 15 seconds - increased for container environments
    serverSelectionTimeout: 15000, // 15 seconds - increased for container environments
    socketTimeout: 15000, // 15 seconds - increased for container environments
    retryWrites: true,
    retryReads: true,
    // TLS settings for container environments (removed deprecated SSL options)
    tls:
      process.env.MONGO_TLS === "true" ||
      process.env.MONGO_URI?.includes("mongodb+srv://"),
    // TLS options for container environments
    tlsAllowInvalidCertificates: process.env.MONGO_TLS_ALLOW_INVALID === "true", // For self-signed certs
    tlsAllowInvalidHostnames:
      process.env.MONGO_TLS_ALLOW_INVALID_HOSTNAMES === "true", // For hostname mismatches
    tlsInsecure: process.env.MONGO_TLS_INSECURE === "true", // For development/testing only
  },

  // Anti-Detection and Security Configuration
  antiDetection: {
    enabled: true,
    maxRetries: 3,
    useRandomUserAgents: true,
    useRandomViewports: true,
    useStealthHeaders: true,
    blockUnnecessaryResources: true,
    simulateHumanBehavior: true,
    respectRobotsTxt: true,

    // Proxy configuration
    proxy: {
      enabled: process.env.PROXY_ENABLED === "true",
      pool: process.env.PROXY_POOL ? process.env.PROXY_POOL.split(",") : [],
      rotation: true,
      healthCheck: true,
      timeout: 10000,
    },

    // Rate limiting per site
    rateLimiting: {
      enabled: true,
      globalLimit: 100, // requests per minute across all sources
      respectSiteSpecificLimits: true,
      adaptiveThrottling: true,
      exponentialBackoff: true,
    },

    // Browser fingerprinting protection
    browserStealth: {
      removeWebdriverProperty: true,
      mockPlugins: true,
      mockLanguages: true,
      mockWebGL: true,
      mockChromeRuntime: true,
      mockPermissions: true,
      randomizeFingerprint: true,
    },

    // Error handling
    errorHandling: {
      intelligentRetry: true,
      adaptiveBackoff: true,
      captchaDetection: true,
      blockingDetection: true,
      networkErrorHandling: true,
      maxConsecutiveErrors: 5,
    },

    // Monitoring and alerting
    monitoring: {
      enabled: false, // Disabled for efficiency - no screenshot debugging
      logDetectionEvents: false,
      alertOnBlocking: false,
      trackSuccessRates: false,
      performanceMetrics: false,
    },
  },

  // Puppeteer Enhanced Configuration
  puppeteer: {
    headless: "new", // Always headless for production efficiency
    devtools: false, // Disable devtools to prevent screenshot debugging
    slowMo: 0, // No slow motion for faster execution

    // Enhanced stealth arguments
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-field-trial-config",
      "--disable-back-forward-cache",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-extensions",
      "--disable-features=TranslateUI",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--force-color-profile=srgb",
      "--memory-pressure-off",
      "--max_old_space_size=4096",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=VizDisplayCompositor",
      "--disable-ipc-flooding-protection",
    ],

    // Timeouts
    defaultTimeout: 30000,
    navigationTimeout: 45000,

    // Performance settings
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ["--enable-automation"],
  },

  // Global job filtering configuration - Focused on core software/data roles
  jobFiltering: {
    // Core keywords that must be present in job titles (at least one)
    requiredKeywords: [
      // Core software engineering
      "software engineer",
      "software developer",
      "software development",
      "frontend",
      "backend",
      "fullstack",
      "full-stack",
      "full stack",
      "web developer",
      "web development",
      "mobile developer",
      "app developer",
      "application developer",
      "systems engineer",
      "platform engineer",

      // Data engineering/science
      "data engineer",
      "data scientist",
      "data analyst",
      "data analytics",
      "machine learning",
      "ml engineer",
      "ai engineer",
      "artificial intelligence",
      "analytics engineer",
      "business intelligence",
      "bi engineer",
      "product manager",
      "product management",
      "pm intern",
      "associate product manager",

      // Business analysis
      "business analyst",
      "business analytics",

      // DevOps/Infrastructure
      "devops",
      "site reliability",
      "sre",
      "infrastructure engineer",
      "cloud engineer",

      // Intern/Entry level indicators
      "intern",
      "internship",
      "co-op",
      "coop",
      "student",
      "new grad",
      "new graduate",
      "entry level",
      "entry-level",
      "junior",
      "recent graduate",
    ],

    // Keywords that exclude jobs (if present, job is rejected)
    excludedKeywords: [
      // Non-software engineering roles
      "geotechnical",
      "civil",
      "mechanical",
      "electrical",
      "chemical",
      "biomedical",
      "environmental",
      "aerospace",
      "nuclear",
      "petroleum",
      "mining",
      "construction",
      "hvac",
      "plumbing",
      "welding",
      "manufacturing",
      "production",
      "assembly",
      "field service",
      "field engineer",
      "field technician",
      "maintenance",
      "repair",
      "quality assurance engineer",
      "qa engineer",
      "test engineer",
      "validation engineer",
      "process engineer",
      "project engineer",
      "design engineer",
      "sales engineer",
      "application engineer",
      "field application",
      "technical support engineer",
      "hardware engineer",
      "firmware engineer",
      "embedded engineer",
      "rf engineer",
      "analog engineer",
      "digital design engineer",
      "circuit",
      "pcb",
      "asic",
      "fpga",
      "water resources",
      "structural",
      "transportation",
      "urban planning",
      "surveying",
      "materials engineer",
      "metallurgical",
      "ceramic",
      "polymer",
      "textile",
      "food engineer",
      "agricultural",
      "forest engineer",
      "packaging engineer",
      "safety engineer",
      "compliance engineer",
      "regulatory engineer",
      "clinical engineer",
      "bioprocess",
      "pharmaceutical",
      "medical device",
      "laboratory",
      "research engineer",
      "operations engineer",
      "facility engineer",
      "building engineer",
      "energy engineer",
      "power engineer",
      "control engineer",
      "instrumentation",
      "automation engineer",
      "industrial engineer",
      "logistics engineer",
      "supply chain engineer",

      // Non-engineering roles
      "manager",
      "director",
      "lead",
      "principal",
      "senior",
      "staff",
      "architect",
      "consultant",
      "advisor",
      "specialist",
      "coordinator",
      "assistant",
      "associate",
      "internship coordinator",
      "recruiter",
      "hr",
      "human resources",
      "marketing",
      "sales",
      "finance",
      "accounting",
      "legal",
      "compliance",
      "regulatory",
      "project manager",
      "program manager",
      "scrum master",
      "agile coach",

      // Specific non-data analysts
      "financial analyst",
      "operations analyst",
      "market analyst",
      "research analyst",
      "policy analyst",

      // Non-tech roles
      "customer service",
      "support",
      "help desk",
      "administrative",
      "clerical",
      "receptionist",
      "secretary",
      "office",
      "administrator",
      "teacher",
      "nurse",
      "doctor",
    ],

    // Specific software/data role indicators (if present, job is accepted regardless)
    softwareDataIndicators: [
      "software engineer",
      "software developer",
      "software development",
      "data engineer",
      "data scientist",
      "machine learning engineer",
      "ml engineer",
      "ai engineer",
      "artificial intelligence engineer",
    ],
  },

  // LinkedIn scraper configuration
  // Single /linkedin command supports:
  // - Time options: day, week, month
  // - Discord commands are lightweight (5-10 jobs), comprehensive mode only for internal use
  linkedin: {
    jobKeywords: [
      // Internship keywords
      "software engineer intern",
      "software development intern",
      "data engineer intern",
      "data scientist intern",
      "data analyst intern",
      "business analyst intern",
      "machine learning intern",
      "machine learning engineer intern",
      "ml engineer intern",
      "ai engineer intern",
      // New graduate/entry level keywords
      "software engineer new grad",
      "software engineer entry level",
      "software development new grad",
      "software development entry level",
      "data engineer new grad",
      "data engineer entry level",
      "data scientist new grad",
      "data scientist entry level",
      "data analyst new grad",
      "business analyst new grad",
      "machine learning engineer new grad",
      "machine learning engineer entry level",
      "ml engineer new grad",
      "ml engineer entry level",
      "ai engineer new grad",
      "ai engineer entry level",
    ],
    jobLocations: ["United States"],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/linkedin-job-cache.json",
    embedColor: "#0077b5",
    // Standard LinkedIn search parameters based on user's URLs
    standardParams: {
      f_CR: "F", // Exclude staffing agencies
      f_JT: "F", // Full-time jobs
      f_WT: "1", // Remote work type
    },
    // Time filter configurations
    timeFilters: {
      day: "r86400", // Past 24 hours
      week: "r604800", // Past week
      month: "r2592000", // Past month
    },
    // Job limits for different modes (selected via /linkedin mode option)
    jobLimits: {
      // Discord mode limits (5-10 jobs for quick Discord responses)
      discord: {
        day: 7,
        week: 10,
        month: 8,
      },
      // Comprehensive mode limits (thorough scraping)
      comprehensive: {
        default: 50,
        week: 75, // Higher limit for comprehensive weekly scraping
      },
    },
    // Default time filter for comprehensive scraping
    defaultComprehensiveFilter: "week", // Focus on past week for new jobs
  },

  // ZipRecruiter scraper configuration
  ziprecruiter: {
    jobKeywords: [
      // Internship keywords
      "software engineer intern",
      "software engineering intern",
      "data engineer intern",
      "data scientist intern",
      "data science intern",
      "data analyst intern",
      "business analyst intern",
      "finance intern",
      "financial analyst intern",
      "machine learning intern",
      // New grad / entry level keywords
      "software engineer new grad",
      "software engineer entry level",
      "data engineer new grad",
      "data scientist new grad",
      "data analyst new grad",
      "business analyst new grad",
      "finance new grad",
      "financial analyst new grad",
      "machine learning engineer new grad",
    ],
    // Popular cities for job searches
    jobLocations: [
      "Los Angeles, CA",
      "Sacramento, CA",
      "San Francisco, CA",
      "Denver, CO",
      "Tampa, FL",
      "Chicago, IL",
      "Boston, MA",
      "Minneapolis, MN",
      "Kansas City, MO",
      "New York, NY",
      "Charlotte, NC",
      "Raleigh, NC",
      "Pittsburgh, PA",
      "Nashville, TN",
      "Austin, TX",
      "Richmond, VA",
      "Seattle, WA",
      "Columbus, OH",
      "Memphis, TN",
      "Grand Rapids, MI",
    ],
    maxJobsPerSearch: 5, // Reduced since we're searching multiple locations
    fileCache: "cache/ziprecruiter-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "5",
      month: "30",
    },
    jobLimits: {
      discord: 15, // Reduced for efficiency
      comprehensive: 120, // More coverage across locations/keywords
    },
  },

  // JobRight GitHub repositories scraper configuration
  jobright: {
    // GitHub repositories to scrape
    repos: [
      {
        name: "Data Analysis New Grad",
        url: "https://github.com/jobright-ai/2026-Data-Analysis-New-Grad",
        type: "new_grad",
        category: "data_analysis",
      },
      {
        name: "Data Analysis Internship",
        url: "https://github.com/jobright-ai/2026-Data-Analysis-Internship",
        type: "intern",
        category: "data_analysis",
      },
      {
        name: "Software Engineer Internship",
        url: "https://github.com/jobright-ai/2026-Software-Engineer-Internship",
        type: "intern",
        category: "software_engineering",
      },
      {
        name: "Business Analyst Internship",
        url: "https://github.com/jobright-ai/2026-Business-Analyst-Internship",
        type: "intern",
        category: "business_analyst",
      },
      {
        name: "Software Engineer New Grad",
        url: "https://github.com/jobright-ai/2026-Software-Engineer-New-Grad",
        type: "new_grad",
        category: "software_engineering",
      },
      {
        name: "Business Analyst New Grad",
        url: "https://github.com/jobright-ai/2026-Business-Analyst-New-Grad",
        type: "new_grad",
        category: "business_analyst",
      },
    ],
    maxJobsPerRepo: 10, // Maximum jobs per repository
    fileCache: "cache/jobright-job-cache.json",
    embedColor: "#1e90ff",
    jobLimits: {
      discord: 15, // Lightweight for Discord commands
      comprehensive: 200, // For internal script execution (both roles)
    },
  },

  // GitHub scraper configuration
  github: {
    // List of GitHub repositories to scrape
    repos: [
      {
        name: "SimplifyJobs-NewGrad",
        url: "https://github.com/SimplifyJobs/New-Grad-Positions",
        maxJobs: 10, // Lightweight for Discord commands
        maxJobsComprehensive: 100, // For internal script execution
        type: "new_grad",
      },
      {
        name: "SimplifyJobs-Summer2026",
        url: "https://github.com/SimplifyJobs/Summer2026-Internships",
        maxJobs: 8, // Lightweight for Discord commands
        maxJobsComprehensive: 80, // For internal script execution
        type: "intern",
      },
      {
        name: "SharunkumarOffSeason",
        url: "https://github.com/sharunkumar/Summer-Internships/blob/dev/README-Off-Season.md",
        maxJobs: 6, // Lightweight for Discord commands
        maxJobsComprehensive: 60, // For internal script execution
        type: "intern",
      },
      // {
      //   name: "QuantInternships2026",
      //   url: "https://github.com/northwesternfintech/2026QuantInternships",
      //   maxJobs: 5, // Lightweight for Discord commands
      //   maxJobsComprehensive: 40, // For internal script execution
      //   type: "quant",
      // },
    ],
    fileCache: "cache/github-job-cache.json",
    embedColor: "#1e90ff",
  },

  // WellFound (AngelList) scraper configuration
  wellfound: {
    roles: [
      { name: "Software Engineer", slug: "software-engineer" },
      { name: "Artificial Intelligence Engineer (AI)", slug: "artificial-intelligence-engineer" },
      { name: "Machine Learning Engineer", slug: "machine-learning-engineer" },
      { name: "Product Manager", slug: "product-manager" },
      { name: "Backend Engineer", slug: "backend-engineer" },
      { name: "Mobile Engineer", slug: "mobile-engineer" },
      { name: "Frontend Engineer", slug: "frontend-engineer" },
      { name: "Full Stack Engineer", slug: "full-stack-engineer" },
      { name: "Data Scientist", slug: "data-scientist" },
      { name: "Software Architect", slug: "software-architect" },
      { name: "Devops Engineer", slug: "devops-engineer" },
    ],
    excludedRoleKeywords: [
      "engineering manager",
      "product designer",
      "designer",
    ],
    locations: [
      { name: "New York", slug: "new-york" },
      { name: "San Francisco", slug: "san-francisco" },
      { name: "Los Angeles", slug: "los-angeles" },
      { name: "Remote", slug: "remote" },
      { name: "Austin", slug: "austin" },
      { name: "Seattle", slug: "seattle" },
      { name: "Boston", slug: "boston" },
      { name: "Chicago", slug: "chicago" },
      { name: "Denver", slug: "denver" },
      { name: "District of Columbia", slug: "district-of-columbia" },
    ],
    maxPagesPerRoleLocation: 5,
    fileCache: "cache/wellfound-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      month: "month",
      threeMonths: "three_months",
    },
    jobLimits: {
      discord: 20,
      comprehensive: 200,
    },
  },

  // Enhanced scraping targets - sites known for blocking bots
  enhancedScrapingTargets: {
    linkedin: {
      useAi: true,
      selectors: {
        jobCard: ".jobs-search__results-list li",
        title: ".base-search-card__title",
        company: ".base-search-card__subtitle",
        location: ".job-search-card__location",
        date: ".job-search-card__listdate",
      },
      commonObstacles: [
        "login wall",
        "cookie consent",
        "premium upgrade prompt",
      ],
    },
    indeed: {
      useAi: true,
      selectors: {
        jobCard: ".job_seen_beacon",
        title: "[data-jk] h2 a span",
        company: ".companyName",
        location: ".companyLocation",
        salary: ".salary-snippet",
      },
      commonObstacles: [
        "location permission",
        "cookie consent",
        "email alerts signup",
      ],
    },
  },

  // MCP Puppeteer Configuration for AI-Enhanced Scraping
  mcpPuppeteer: {
    enabled: false, // Disabled for efficiency - no AI-enhanced scraping
    openaiApiKey: process.env.OPENAI_API_KEY, // Required for AI features
    visionModel: process.env.VISION_MODEL || "gpt-4-vision-preview",
    apiBaseUrl: process.env.API_BASE_URL || "https://api.openai.com/v1",
    headless: true, // Always headless for efficiency
    maxInteractionAttempts: 3, // How many times AI tries to bypass obstacles
    waitForNetworkIdle: true, // Wait for page to fully load
    timeoutSeconds: 30,
    // Sites that benefit most from AI-enhanced scraping
    prioritySites: [
      "indeed.com", // Cookie consent, location prompts
      "linkedin.com", // Login walls, consent banners
      "ziprecruiter.com", // Newsletter prompts
      "monster.com", // Various popups
    ],
    // Fallback behavior when AI scraping fails
    fallbackToTraditional: true,
    fallbackTimeout: 10, // seconds before falling back
  },

  // Message Summarization Configuration
  messageSummarization: {
    enabled: false, // Disabled for efficiency
    maxMessagesPerSummary: 100,
    maxTokensPerRequest: 12000,
    maxSummaryLength: 1000,
    rateLimitPerHour: 10,
    defaultSummaryType: "general",
    embedColor: "#3498db",
    allowedChannels: [], // Empty = all channels allowed
    blockedChannels: [], // Channels to block from summarization
    allowedUsers: [], // Empty = all users allowed
    adminOnlyConfig: true,
    saveSummariesToDb: false, // Don't save summaries to DB for efficiency
    autoCleanupOldSummaries: true,
    cleanupAfterDays: 30,
  },

  // Logging configuration
  logging: {
    directory: "logs",
    errorFile: "error.log",
    combinedFile: "combined.log",
  },
};
