const fs = require('fs');
const path = require('path');

// Create cache directory and files for all job sources
const sources = [
  'linkedin',
  'ziprecruiter',
  'jobright',
  'github',
  'wellfound'
];

console.log('📁 Creating cache directory structure...');

// Create cache directory
const cacheDir = 'cache';
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`✅ Created cache directory: ${cacheDir}`);
} else {
  console.log(`📁 Cache directory already exists: ${cacheDir}`);
}

// Create empty cache files for each source
sources.forEach(source => {
  const cacheFile = path.join(cacheDir, `${source}-job-cache.json`);
  if (!fs.existsSync(cacheFile)) {
    fs.writeFileSync(cacheFile, JSON.stringify([]));
    console.log(`✅ Created cache file: ${cacheFile}`);
  } else {
    console.log(`📄 Cache file already exists: ${cacheFile}`);
  }
});

// Create logs directory
const logsDir = 'logs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`✅ Created logs directory: ${logsDir}`);
} else {
  console.log(`📁 Logs directory already exists: ${logsDir}`);
}

console.log('\n🏁 Cache directory structure setup complete!');
