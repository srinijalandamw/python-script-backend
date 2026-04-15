require("dotenv").config();

const express = require("express");

/**
 * ✅ FIXED IMPORT (IMPORTANT)
 * We now import connectDB from object
 */
const { connectDB } = require("./config/db.config");

const { startRealTimeMonitor } = require("./k8s/k8s.job.monitor");

const app = express();
app.use(express.json());



/**
 * 🚀 ROUTES
 */
const scriptRoutes = require("./routes/script.route");
app.use("/scripts", scriptRoutes);

/**
 * 🚀 START APP
 */
async function startServer() {
  try {
    /**
     * ✅ CONNECT DB FIRST (MANDATORY)
     */
    await connectDB();

    console.log("✅ MongoDB Connected");

    /**
     * ✅ START MONITOR ONLY AFTER DB
     * (VERY IMPORTANT FIX)
     */
    startRealTimeMonitor();

    console.log("📡 K8s Monitor started");

    /**
     * HEALTH CHECK
     */
    app.get("/", (req, res) => {
      res.json({ status: "running" });
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Startup failed:", err.message);
    process.exit(1);
  }
}

/**
 * 🚀 START SERVER
 */
startServer();
