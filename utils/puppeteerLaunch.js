const fs = require("fs");
const path = require("path");
const config = require("../config");

/**
 * Get a safe, unique directory for Puppeteer userDataDir to avoid SingletonLock and TMPDIR issues.
 * Uses project-local .puppeteer-tmp or os.tmpdir(), and creates a unique subdir per launch.
 * @returns {string} Absolute path to a directory that exists and is writable
 */
function getPuppeteerUserDataDir() {
  const base = process.env.PUPPETEER_TMP_DIR || path.join(process.cwd(), ".puppeteer-tmp");
  const fallback = require("os").tmpdir();
  let baseDir = base;
  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (_) {
      baseDir = fallback;
    }
  }
  const unique = `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = path.join(baseDir, unique);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get launch options for Puppeteer with a safe userDataDir and config args.
 * Use this to avoid "SingletonLock: No such file or directory" and profile corruption.
 * @param {object} overrides - Optional overrides (headless, args, etc.)
 * @returns {object} Options to pass to puppeteer.launch()
 */
function getPuppeteerLaunchOptions(overrides = {}) {
  const userDataDir = getPuppeteerUserDataDir();
  const baseArgs = config.puppeteer?.args || ["--no-sandbox", "--disable-setuid-sandbox"];
  return {
    headless: config.puppeteer?.headless ?? "new",
    userDataDir,
    args: baseArgs,
    ...overrides,
  };
}

module.exports = {
  getPuppeteerUserDataDir,
  getPuppeteerLaunchOptions,
};
