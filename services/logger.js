const fs = require('fs');
const path = require('path');
const config = require('../config');

// Ensure log directory exists
if (!fs.existsSync(config.logging.directory)) {
  fs.mkdirSync(config.logging.directory);
}

/**
 * Log a message to console and file
 * @param {string} message - The message to log
 * @param {string} level - The log level (info, error, warn)
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;
  
  // Log to console
  console.log(logMessage);
  
  // Log to appropriate file
  const logFile = path.join(
    config.logging.directory, 
    level === 'error' ? config.logging.errorFile : config.logging.combinedFile
  );
  
  fs.appendFileSync(logFile, logMessage);
}

module.exports = {
  log
};