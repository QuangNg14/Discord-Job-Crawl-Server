// setup-mongodb.js - MongoDB connection setup helper
require("dotenv").config();
const { MongoClient } = require("mongodb");
const config = require("./config");

async function testMongoConnection() {
  console.log("🔧 MongoDB Connection Setup Helper\n");

  // Check environment variables
  console.log("📋 Environment Variables:");
  console.log(`MONGO_URI: ${process.env.MONGO_URI ? "Set" : "Not set"}`);
  console.log(`DB_NAME: ${process.env.DB_NAME ? "Set" : "Not set"}\n`);

  // Test different connection options
  const connectionOptions = [
    {
      name: "Local MongoDB (default)",
      uri: "mongodb://localhost:27017",
      options: {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        ssl: false,
        tls: false,
      }
    },
    {
      name: "MongoDB Atlas (if MONGO_URI is set)",
      uri: process.env.MONGO_URI,
      options: {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
        ssl: true,
        tls: true,
      }
    }
  ];

  for (const option of connectionOptions) {
    if (!option.uri) continue;
    
    console.log(`🔌 Testing: ${option.name}`);
    console.log(`URI: ${option.uri}`);
    
    try {
      const client = new MongoClient(option.uri, option.options);
      await client.connect();
      
      const db = client.db(config.mongo.dbName || "job_scraper_bot");
      await db.admin().ping();
      
      console.log("✅ Connection successful!\n");
      await client.close();
      
      // If this is the first successful connection, suggest using it
      if (option.name === "Local MongoDB (default)") {
        console.log("💡 Local MongoDB is working! You can use the default configuration.");
        console.log("💡 To use MongoDB Atlas instead, set the MONGO_URI environment variable.\n");
      }
      
      return true;
      
    } catch (error) {
      console.log(`❌ Connection failed: ${error.message}`);
      
      if (option.name === "Local MongoDB (default)") {
        console.log("💡 Local MongoDB is not running or not accessible.");
        console.log("💡 To start MongoDB locally:");
        console.log("   - Install MongoDB Community Server");
        console.log("   - Start MongoDB service");
        console.log("   - Or use Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest");
        console.log("💡 To use MongoDB Atlas instead, set MONGO_URI environment variable.\n");
      }
    }
  }

  console.log("❌ No MongoDB connections were successful.");
  console.log("\n🔧 Setup Options:");
  console.log("1. Install MongoDB locally:");
  console.log("   - Download from: https://www.mongodb.com/try/download/community");
  console.log("   - Start the MongoDB service");
  console.log("   - Default connection: mongodb://localhost:27017");
  console.log("\n2. Use MongoDB Atlas (cloud):");
  console.log("   - Sign up at: https://www.mongodb.com/atlas");
  console.log("   - Create a cluster and get connection string");
  console.log("   - Set MONGO_URI environment variable");
  console.log("\n3. Use Docker:");
  console.log("   docker run -d -p 27017:27017 --name mongodb mongo:latest");
  console.log("\n4. Continue without MongoDB (file-based caching will be used)");
  
  return false;
}

// Run the setup
testMongoConnection().then((success) => {
  if (success) {
    console.log("🎉 MongoDB is ready to use!");
  } else {
    console.log("\n⚠️  MongoDB setup incomplete, but the application will still work with file-based caching.");
  }
  process.exit(0);
}).catch((error) => {
  console.error("❌ Setup failed:", error.message);
  process.exit(1);
});
