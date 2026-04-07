/**
 * 🚀 SCRIPT EXECUTOR (PRODUCTION READY)
 * Bridge between worker and execution engine
 *Worker calls this and decide whether the script will run locally or docker or K8s
 * ✅ Loads script from storage (local/S3)
 * ✅ Unzips into runtime/jobs/{executionId}
 * ✅ Runs inside Docker
 * ✅ Passes EXECUTION_ID + input.json
 * ✅ Returns logs
 */

const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const ScriptVersion = require("../modules/scripts/versions/scriptVersion.model");
const { loadScript } = require("../utils/scriptLoader");

/**
 * 🚀 EXECUTE SCRIPT
 */
async function executeScript(execution) {
  try {
    console.log("🚀 Executing script:", execution._id);

    // =========================
    // 1️⃣ GET SCRIPT VERSION
    // =========================
    const scriptVersion = await ScriptVersion.findOne({
      scriptId: execution.scriptId,
      version: execution.version,
      isActive: true,
    });

    if (!scriptVersion) {
      throw new Error("Script version not found");
    }

    // =========================
    // 2️⃣ LOAD SCRIPT (ZIP → RUNTIME)
    // =========================
    const jobDir = await loadScript({
      executionId: execution._id.toString(),
      storageKey: scriptVersion.storageKey,
    });

    const entrypoint = scriptVersion.entrypoint || "main.py";

    const entryPath = path.join(jobDir, entrypoint);

    // =========================
    // 3️⃣ WRITE INPUT.JSON
    // =========================
    const inputPath = path.join(jobDir, "input.json");

    fs.writeFileSync(
      inputPath,
      JSON.stringify(execution.input || {}, null, 2)
    );

    // =========================
    // 4️⃣ RUN DOCKER
    // =========================
    const command = [
      "docker run --rm",
      `-v ${jobDir}:/app`,
      `-e EXECUTION_ID=${execution._id}`,
      "python:3.10",
      `python /app/${entrypoint}`,
    ].join(" ");

    console.log("🐳 Running Docker:", command);

    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
        if (err) {
          console.error("❌ Execution failed:", err.message);
          return reject(err);
        }

        console.log("📜 STDOUT:", stdout);
        if (stderr) console.error("⚠️ STDERR:", stderr);

        resolve({
          stdout,
          stderr,
          jobDir,
        });
      });
    });

  } catch (err) {
    console.error("❌ Execution error:", err.message);
    throw err;
  }
}

module.exports = {
  executeScript,
};