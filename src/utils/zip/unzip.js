/**
 * ============================================================
 * 📦 ZIP UTILITY (PRODUCTION READY)
 * ============================================================
 *
 * ✅ Extracts ZIP safely
 * ✅ Prevents directory traversal attacks
 * ✅ Works with buffers written to disk
 */

const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");

/**
 * 📂 UNZIP FILE
 */
async function unzipFile(zipPath, extractTo) {
  try {
    console.log("📂 Unzipping:", zipPath);

    if (!fs.existsSync(zipPath)) {
      throw new Error("ZIP file does not exist");
    }

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    if (!entries.length) {
      throw new Error("ZIP is empty");
    }

    for (const entry of entries) {
      const entryPath = path.join(extractTo, entry.entryName);

      // 🔒 Prevent path traversal attacks
      if (!entryPath.startsWith(path.resolve(extractTo))) {
        throw new Error("Invalid ZIP entry path");
      }

      if (entry.isDirectory) {
        fs.mkdirSync(entryPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(entryPath), { recursive: true });
        fs.writeFileSync(entryPath, entry.getData());
      }
    }

    console.log("✅ Unzip completed:", extractTo);

  } catch (err) {
    console.error("❌ Unzip Error:", err.message);
    throw err;
  }
}

module.exports = unzipFile;