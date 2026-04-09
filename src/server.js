require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db.config");
const { startRealTimeMonitor } = require("./k8s/k8s.job.monitor");

const app = express();
app.use(express.json());

/**
 * 🚀 WORKER SAFE IMPORT
 */
let worker;

try {
  worker = require("./modules/executions/execution.worker");
  console.log("✅ Worker loaded successfully");
} catch (err) {
  console.error("❌ Worker load failed:");
  console.error(err);
}

/**
 * 🚀 ROUTES
 */
const scriptRoutes = require("./routes/script.route");
app.use("/scripts", scriptRoutes);

//const scriptDownloadRoute = require("./routes/scriptDownload.route");
//app.use("/api", scriptDownloadRoute);

/**
 * 🚀 START APP
 */
async function startServer() {
  try {
    await connectDB();
    console.log("✅ MongoDB Connected");

    /**
     * ❌ DISABLED POLLING WORKER
     */
    console.log("⚠️ Worker polling DISABLED (event-driven mode)");

    app.get("/", (req, res) => {
      res.json({ status: "running" });
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Startup failed:", err.message);
  }
}

startServer();
startRealTimeMonitor();

















/*

require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db.config");
const { startJobMonitor } = require("./k8s/k8s.job.monitor");

const app = express();

app.use(express.json());

/**
 * 🚀 WORKER SAFE IMPORT
 */

/*
let worker;

try {
  worker = require("./modules/executions/execution.worker");
  console.log("✅ Worker loaded successfully");
} catch (err) {
  console.error("❌ Worker load failed:");
  console.error(err); // 🔥 THIS LINE IS IMPORTANT
}

/**
 * 🚀 START APP
 */

/*
async function startServer() {
  try {
    // ❌ DO NOT CALL mongoose.connect here (already in connectDB)

    await connectDB();
    console.log("✅ MongoDB Connected");

    // 🚀 start worker only if exists
    /*
    if (worker?.start) {
      worker.start();
      console.log("🚀 Worker started");
    } else {
      console.log("⚠️ Worker not available");
    }
    */
   /**
 * 🚀 EVENT-DRIVEN MODE
 * Worker will NOT auto start
 */

/*
console.log("⚠️ Worker polling DISABLED (event-driven mode)");
    app.get("/", (req, res) => {
      res.json({ status: "running" });
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("❌ Startup failed:", err.message);
  }
}

const scriptRoutes = require("./routes/script.route");

app.use("/scripts", scriptRoutes);

const scriptDownloadRoute = require("./routes/scriptDownload.route");

app.use("/api", scriptDownloadRoute);



startServer();
startJobMonitor();

*/