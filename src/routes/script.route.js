/**
 * ============================================================
 * 📦 SCRIPT ROUTES (NATIVE MONGODB VERSION)
 * ============================================================
 */

const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer();

const storage = require("../utils/storage");
const { getDB } = require("../config/db.config");

const executionService = require("../services/execution.service");

/**
 * ============================================================
 * 📤 UPLOAD SCRIPT
 * ============================================================
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { scriptId, version } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    if (!scriptId || !version) {
      return res.status(400).json({ error: "scriptId and version required" });
    }

    const key = `scripts/${scriptId}/${version}/script.zip`;

    console.log("📦 Uploading script to S3:", key);

    await storage.uploadFile(key, req.file.buffer);

    const db = getDB();

    await db.collection("scriptVersions").insertOne({
      scriptId,
      version,
      storageKey: key,
      entrypoint: "main.py",
      inputSchema: {},
      isActive: true,
      createdAt: new Date(),
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
 */
router.post("/:scriptId/:version/execute", async (req, res) => {
  try {
    const { scriptId, version } = req.params;
    const inputData = req.body;

    console.log("⚡ Execution trigger received");
    console.log("Script:", scriptId, "Version:", version);

    const execution = await executionService.createExecution(
      scriptId,
      version,
      inputData,
      null
    );

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
 * 📥 HEALTH CHECK
 * ============================================================
 */
router.get("/", (req, res) => {
  res.json({
    message: "Script service is running",
  });
});

module.exports = router;
