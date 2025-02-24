import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection URI
const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not defined in environment variables");
}

let client;
let clientPromise;
let db;

// Prevent multiple connections in development
if (!global._mongoClientPromise) {
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

// Get database function
async function getDb(dbName) {
  const connectedClient = await clientPromise;
  db = connectedClient.db(dbName);
  console.log(`🗄️ Connected to MongoDB Database: ${dbName}`);
  return db;
}

// Graceful shutdown handling
process.on("SIGINT", async () => {
  if (client) {
    await client.close();
    console.log("MongoDB connection closed.");
    process.exit(0);
  }
});

export default getDb;
