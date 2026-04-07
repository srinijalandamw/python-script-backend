/**
 * ============================================================
 * EXECUTOR ENGINE (PRODUCTION CORE): 
 *  if (mode === "k8s") → k8s
    if (mode === "docker") → docker
    if (mode === "local") → local
 * ------------------------------------------------------------
 * This is the central execution brain of the system.
 *
 * It does NOT know about Mongo, API, or queues.
 * It ONLY executes scripts via strategy layer.
 *
 * Strategies:
 *   - docker.strategy.js (production default)
 *   - local.strategy.js (debug/testing)
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");

class ExecutorEngine {
  constructor(strategy, logger = console) {
    this.strategy = strategy; // injected execution strategy
    this.logger = logger;
  }

  /**
   * MAIN EXECUTION FUNCTION
   * ------------------------------------------------------------
   * execution: Mongo execution document
   * scriptBuffer: zip buffer from storage
   * inputData: user input JSON
   */
  async execute({ execution, scriptBuffer, inputData }) {
    const executionId = execution._id.toString();

    this.logger.log(`[ENGINE] Starting execution: ${executionId}`);

    // ============================================================
    // 1. CREATE WORKSPACE
    // ============================================================
    const workspace = path.join(
      os.tmpdir(),
      "runtime",
      executionId
    );

    fs.mkdirSync(workspace, { recursive: true });

    this.logger.log(`[ENGINE] Workspace created: ${workspace}`);

    // ============================================================
    // 2. EXTRACT ZIP
    // ============================================================
    const zip = new AdmZip(scriptBuffer);
    zip.extractAllTo(workspace, true);

    this.logger.log(`[ENGINE] ZIP extracted`);

    // ============================================================
    // 3. FLATTEN IF NESTED FOLDER
    // ============================================================
    const files = fs.readdirSync(workspace);

    if (
      files.length === 1 &&
      fs.lstatSync(path.join(workspace, files[0])).isDirectory()
    ) {
      const inner = path.join(workspace, files[0]);

      fs.readdirSync(inner).forEach((file) => {
        fs.renameSync(
          path.join(inner, file),
          path.join(workspace, file)
        );
      });

      fs.rmSync(inner, { recursive: true, force: true });

      this.logger.log(`[ENGINE] Workspace flattened`);
    }

    // ============================================================
    // 4. WRITE INPUT FILE
    // ============================================================
    fs.writeFileSync(
      path.join(workspace, "input.json"),
      JSON.stringify(inputData || {}, null, 2)
    );

    this.logger.log(`[ENGINE] input.json written`);

    // ============================================================
    // 5. EXECUTE STRATEGY (DOCKER / LOCAL)
    // ============================================================
    const result = await this.strategy.run({
      workspace,
      executionId,
    });

    this.logger.log(`[ENGINE] Execution completed`);

    // ============================================================
    // 6. CLEANUP WORKSPACE (OPTIONAL)
    // ============================================================
    // ⚠️ UNCOMMENT IN PRODUCTION AFTER TESTING
    /*
    fs.rmSync(workspace, { recursive: true, force: true });
    this.logger.log(`[ENGINE] Workspace cleaned`);
    */

    return result;
  }
}

module.exports = ExecutorEngine;