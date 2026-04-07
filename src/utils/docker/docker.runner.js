/**
 * 🐳 DOCKER RUNNER (PRODUCTION READY)
 * -----------------------------------
 * Runs Python scripts inside Docker safely
 */

const { exec } = require("child_process");
const path = require("path");

/**
 * 🚀 Run Python script inside Docker
 */
function runPythonInDocker(jobDir, entrypoint) {
  return new Promise((resolve, reject) => {
    try {
      console.log("🐳 Starting Docker container...");

      /**
       * 🧠 Normalize path (important for Mac/Linux)
       */
      const absolutePath = path.resolve(jobDir);

      /**
       * 🚀 Docker Command
       * - Mount job directory
       * - Set working directory (CRITICAL FIX)
       * - Run Python script
       */
      const command = `
docker run --rm \
  -v ${absolutePath}:/app/script \
  -w /app/script \
  python:3.10-slim \
  sh -c "pip install -r requirements.txt >/dev/null 2>&1 && python ${entrypoint}"
`;

      exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        console.log("📜 STDOUT:\n", stdout);
        console.error("⚠️ STDERR:\n", stderr);

        if (error) {
          return reject(
            new Error(`Docker exited with code ${error.code}\n${stderr}`)
          );
        }

        resolve(stdout || "Execution completed");
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { runPythonInDocker };