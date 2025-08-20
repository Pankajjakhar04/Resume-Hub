// MongoDB Connection Setup
const { MongoClient, ObjectId } = require('mongodb');

// Connection URL and Database Name from .env
require('dotenv').config();
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'resumeHub';

let client;
let db;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    if (!client) {
      // Using modern connection options (no need for useUnifiedTopology in newer versions)
      client = new MongoClient(url);
      await client.connect();
      console.log('Connected successfully to MongoDB server');
      db = client.db(dbName);
      
      // Create indexes for better performance
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('resumes').createIndex({ userId: 1 });
    }
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Close MongoDB connection
async function closeMongoDBConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

// Export MongoDB connection functions and ObjectId
module.exports = {
  connectToMongoDB,
  closeMongoDBConnection,
  ObjectId
};