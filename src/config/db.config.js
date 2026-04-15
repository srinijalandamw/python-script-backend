// src/config/db.config.js

const { MongoClient } = require("mongodb");

let client;
let db;

const connectDB = async () => {
  try {
    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    db = client.db(); // default DB from URI

    console.log("🔌 MongoDB Connected (Native Driver)");

    return db;
  } catch (err) {
    console.error("❌ DB Connection Error:", err.message);
    process.exit(1);
  }
};

const getDB = () => {
  if (!db) {
    throw new Error("❌ DB not initialized. Call connectDB first.");
  }
  return db;
};

module.exports = {
  connectDB,
  getDB,
};
