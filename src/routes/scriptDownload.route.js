const express = require("express");
const router = express.Router();
const storage = require("../utils/storage");

/**
 * 📥 DOWNLOAD SCRIPT ZIP (PRODUCTION SAFE - NO REGEX ROUTES)
 * Used by Kubernetes container:
 * curl http://host.minikube.internal:3000/scripts/...
 * 👉 This serves the .zip file
 */
router.get("/scripts", (req, res) => {
  try {
    const fullUrl = req.originalUrl;

    // 🔥 Extract everything after /scripts/
    const prefix = "/scripts/";
    const index = fullUrl.indexOf(prefix);

    if (index === -1) {
      return res.status(400).send("Invalid path");
    }

    const filePath = fullUrl.substring(index + prefix.length);

    console.log("📥 Serving script from storage:", filePath);

    const fileBuffer = storage.readFile(filePath);

    console.log("📦 File size:", fileBuffer.length);

    res.setHeader("Content-Type", "application/zip");
    res.send(fileBuffer);

  } catch (err) {
    console.error("❌ Script route error:", err.message);
    res.status(500).send("Failed to fetch script");
  }
});

module.exports = router;