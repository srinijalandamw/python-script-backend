/**
 * ============================================================
 * 📦 SCRIPT ROUTES (TRITON ALIGNED + VERSION VALIDATION)
 * ============================================================
 */

const express = require("express");
const router = express.Router();

const multer = require("multer");
const upload = multer();

const storage = require("../utils/storage");
const { getDB } = require("../config/db.config");
const { ObjectId } = require("mongodb");

const executionService = require("../services/execution.service");

/**
 * ============================================================
 * 📤 UPLOAD SCRIPT
 * ============================================================
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Extract fields from request body (multipart/form-data)
    const { 
      scriptId, 
      version, 
      inputSchema = "{}",           // JSON string, default empty object
      changeSummary = "Initial upload"
    } = req.body;

    // ✅ Validate version format (must be like 1.0.0, 1.2.3, etc.)
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!version || !versionRegex.test(version)) {
      return res.status(400).json({
        error: "Invalid version format. Use semantic versioning like 1.0.0, 1.2.3, etc."
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    if (!scriptId) {
      return res.status(400).json({ error: "scriptId required" });
    }

    // Parse inputSchema from JSON string (if provided)
    let parsedInputSchema = {};
    try {
      parsedInputSchema = JSON.parse(inputSchema);
    } catch (err) {
      console.warn("Invalid inputSchema JSON, using empty object");
      parsedInputSchema = {};
    }

    const key = `scripts/${scriptId}/${version}/script.zip`;

    console.log("📦 Uploading script to S3:", key);

    await storage.uploadFile(key, req.file.buffer);

    const db = getDB();

    // Get user from auth middleware if available, otherwise "system"
    const createdBy = req.user?.id || req.user?.email || "system";

    await db.collection("scriptversions").insertOne({
      scriptId: new ObjectId(scriptId),
      version,                           // now stored as "1.0.0", not "v1"
      entrypoint: "main.py",
      inputSchema: parsedInputSchema,    // dynamic schema
      s3Key: key,
      s3ScriptPath: null,                // not used (signed URLs on demand)
      changeSummary,                     // dynamic summary
      isActive: true,
      created: new Date(),
      createdBy,
      updatedAt: new Date(),
    });

    return res.json({
      message: "Script uploaded successfully",
      s3Key: key,
      version,
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