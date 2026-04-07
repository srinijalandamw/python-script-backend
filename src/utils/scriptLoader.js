/**
 * ============================================================
 * 📦 SCRIPT LOADER (PRODUCTION READY - LOCAL + S3)
 * scriptLoader.js
👉 Loads script metadata
 * 
 * ============================================================
 *
 * ✅ Loads script.zip from storage (LOCAL / S3)
 * ✅ Creates isolated runtime folder per execution
 * ✅ Writes ZIP locally
 * ✅ Unzips safely
 * ✅ Returns execution directory path
 * ✅ Handles cleanup of old files (important in prod)
 */

const path = require("path");
const fs = require("fs");
const unzip = require("./zip/unzip");
const storage = require("./storage");

const RUNTIME_BASE_DIR = path.join(process.cwd(), "runtime", "jobs");

/**
 * 🧹 CLEAN DIRECTORY (SAFE RESET)
 */
function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * 📦 LOAD SCRIPT FOR EXECUTION
 */
async function loadScript({ executionId, storageKey }) {
  try {
    console.log("📦 Loading script for execution...");
    console.log("📌 Execution ID:", executionId);
    console.log("📁 Storage Key:", storageKey);

    if (!executionId) {
      throw new Error("executionId is required");
    }

    if (!storageKey) {
      throw new Error("storageKey is required");
    }

    // ============================================================
    // 1️⃣ PREPARE RUNTIME DIRECTORY
    // ============================================================
    const executionDir = path.join(RUNTIME_BASE_DIR, executionId);

    // Clean old leftovers (VERY IMPORTANT)
    cleanDirectory(executionDir);

    fs.mkdirSync(executionDir, { recursive: true });

    // ============================================================
    // 2️⃣ FETCH ZIP FROM STORAGE (LOCAL / S3)
    // ============================================================
    console.log("📥 Fetching script.zip from storage...");

    const buffer = await storage.readFile(storageKey);

    if (!buffer || buffer.length === 0) {
      throw new Error("Empty or missing script.zip from storage");
    }

    // ============================================================
    // 3️⃣ SAVE ZIP LOCALLY
    // ============================================================
    const zipPath = path.join(executionDir, "script.zip");

    fs.writeFileSync(zipPath, buffer);

    console.log("💾 ZIP saved locally:", zipPath);

    // ============================================================
    // 4️⃣ UNZIP SCRIPT
    // ============================================================
    console.log("📂 Unzipping script...");

    await unzip(zipPath, executionDir);

    // Optional: remove zip after extraction
    fs.unlinkSync(zipPath);

    console.log("✅ Script extracted at:", executionDir);

    // ============================================================
    // 5️⃣ VALIDATE ENTRYPOINT EXISTS
    // ============================================================
    const files = fs.readdirSync(executionDir);

    if (!files.includes("main.py")) {
      console.warn("⚠️ main.py not found at root — check ZIP structure");
    }

    return executionDir;

  } catch (err) {
    console.error("❌ Script Loader Error:", err.message);
    throw err;
  }
}

module.exports = {
  loadScript,
};