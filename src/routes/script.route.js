/**
 * ============================================================
 * 📦 SCRIPT ROUTES (UPLOAD + EXECUTION)
 * ============================================================
 *
 * This file handles:
 * 1. Uploading script ZIP to S3
 * 2. Triggering execution (K8s job)
 *
 * Acts as entry point for:
 * Client / Postman → Backend → Execution Service
 */

const express = require("express");
const router = express.Router();

/**
 * 📦 File upload middleware
 * - multer stores file in memory (buffer)
 * - we directly send buffer to S3
 */
const multer = require("multer");
const upload = multer();

/**
 * 📦 Storage abstraction
 * - uploadFile → S3
 * - (future: can switch providers easily)
 */
const storage = require("../utils/storage");

/**
 * 📦 DB model
 * - stores script metadata
 */
const ScriptVersion = require("../models/scriptVersion.model");

/**
 * 🚀 Execution service
 * - creates execution entry
 * - triggers Kubernetes job
 */
const executionService = require("../services/execution.service");

/**
 * ============================================================
 * 📤 UPLOAD SCRIPT TO S3
 * ============================================================
 *
 * Endpoint:
 * POST /scripts/upload
 *
 * Body (form-data):
 * - file (script.zip)
 * - scriptId
 * - version
 *
 * Flow:
 * file → buffer → S3 → DB (ScriptVersion)
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { scriptId, version } = req.body;

    /**
     * 🔍 Validate input
     */
    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    if (!scriptId || !version) {
      return res.status(400).json({ error: "scriptId and version required" });
    }

    /**
     * 📁 Construct S3 path
     *
     * IMPORTANT:
     * This must match what K8s will use later
     */
    const key = `scripts/${scriptId}/${version}/script.zip`;

    console.log("📦 Uploading script to S3:", key);

    /**
     * ☁️ Upload to S3
     */
    await storage.uploadFile(key, req.file.buffer);

    /**
     * 🗄️ Store metadata in DB
     */
    await ScriptVersion.create({
      scriptId,
      version,
      storageKey: key,
      entrypoint: "main.py", // default (can be dynamic later)
      inputSchema: {},
    });

    return res.json({
      message: "Script uploaded successfully",
      storageKey: key,
    });

  } catch (err) {
    console.error("❌ Upload error:", err.message);

    return res.status(500).json({
      error: "Upload failed",
      details: err.message,
    });
  }
});

/**
 * ============================================================
 * 🚀 EXECUTE SCRIPT
 * ============================================================
 *
 * Endpoint:
 * POST /scripts/:scriptId/:version/execute
 *
 * Body:
 * JSON input for script
 *
 * Flow:
 * API → ExecutionService → Mongo → K8s Job
 */
router.post("/:scriptId/:version/execute", async (req, res) => {
  try {
    const { scriptId, version } = req.params;
    const inputData = req.body;

    console.log("⚡ Execution trigger received");
    console.log("Script:", scriptId, "Version:", version);

    /**
     * 🚀 Create execution
     * - stores in Mongo
     * - generates processId
     * - triggers Kubernetes job
     */
    const execution = await executionService.createExecution(
      scriptId,
      version,
      inputData,
      null // userId (can be added later)
    );

    /**
     * 📤 Response to client
     */
    return res.status(201).json({
      success: true,
      message: "Execution started",
      executionId: execution._id,
      processId: execution.processId,
      status: execution.status,
    });

  } catch (err) {
    console.error("❌ Execution error:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/**
 * ============================================================
 * 📥 HEALTH CHECK (OPTIONAL)
 * ============================================================
 */
router.get("/", (req, res) => {
  res.json({
    message: "Script service is running",
  });
});

module.exports = router;
