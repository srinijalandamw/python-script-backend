/**
 * ============================================================
 * 📦 SCRIPT DOWNLOAD ROUTE (PRODUCTION SAFE - EXPRESS v5 FIXED)
 * ============================================================
 *
 * ✅ No wildcard routes (avoids path-to-regexp crash)
 * ✅ Works in Express v5+
 * ✅ Supports nested paths
 * ✅ Used by Kubernetes pods to download script.zip
 */

const express = require("express");
const router = express.Router();

const storage = require("../utils/storage");

/**
 * 🚀 Middleware to serve script files
 *
 * Example request:
 * GET /scripts/scripts/<scriptId>/<version>/script.zip
 */
router.use("/scripts", async (req, res) => {
  try {
    // ============================================================
    // 🔥 EXTRACT FULL STORAGE KEY
    // ============================================================

    // originalUrl = /scripts/scripts/65f.../1.0/script.zip
    const fullUrl = req.originalUrl;

    // remove "/scripts/" prefix
    const key = fullUrl.replace(/^\/scripts\//, "");

    console.log("📥 Serving script from storage:", key);

    // ============================================================
    // 📥 READ FROM STORAGE (LOCAL / S3)
    // ============================================================

    const fileBuffer = await storage.readFile(key);

    if (!fileBuffer || fileBuffer.length === 0) {
      console.error("❌ Script not found or empty:", key);
      return res.status(404).send("Script not found");
    }

    // ============================================================
    // 📤 SEND FILE TO CLIENT (K8s POD)
    // ============================================================

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=script.zip"
    );

    return res.send(fileBuffer);

  } catch (error) {
    console.error("❌ Script route error:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

module.exports = router;