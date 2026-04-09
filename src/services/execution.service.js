/**
 * 🚀 EXECUTION SERVICE (KUBERNETES + S3 + PROCESS ID BASED)
 *
 * RESPONSIBILITIES:
 * - Create execution record
 * - Generate processId (job name)
 * - Fetch script from DB
 * - Generate S3 signed URL
 * - Trigger Kubernetes Job
 */

const Execution = require("../models/execution.model");
const ScriptVersion = require("../models/scriptVersion.model");
const { createJob } = require("../k8s/k8s.client");
const { getSignedFileUrl } = require("../utils/storage/s3"); // must exist

/**
 * 🧠 GENERATE PROCESS ID
 * Format: job-<executionId>
 */
function generateProcessId(executionId) {
  return `job-${executionId}`;
}

class ExecutionService {
  /**
   * 🚀 CREATE EXECUTION ENTRY
   */
  async createExecution(scriptId, version, input = {}, userId) {
    /**
     * 1. Create execution in DB
     */
    const execution = await Execution.create({
      scriptId,
      version,
      input,
      createdBy: userId,
      status: "PENDING",
    });

    /**
     * 2. Generate processId
     */
    const processId = generateProcessId(execution._id);

    execution.processId = processId;
    await execution.save();

    console.log("🆔 Process ID generated:", processId);

    /**
     * 3. Fetch script version from DB
     */
    const scriptVersion = await ScriptVersion.findOne({
      scriptId,
      version,
      isActive: true,
    });

    if (!scriptVersion) {
      throw new Error("Script version not found");
    }

    /**
     * 4. Generate S3 signed URL (PRIVATE BUCKET)
     */
    const scriptUrl = await getSignedFileUrl(
      scriptVersion.storageKey
    );

    console.log("🔐 Signed URL generated");

    /**
     * 5. Trigger Kubernetes Job
     */
    await createJob(
      processId,
      scriptUrl,
      input,
    );

    /**
     * 6. Update execution → RUNNING
     */
    execution.status = "RUNNING";
    execution.startedAt = new Date();

    await execution.save();

    console.log("🚀 Execution started:", processId);

    return execution;
  }

  /**
   * 📄 GET EXECUTION BY ID
   */
  async getExecution(executionId) {
    return Execution.findById(executionId);
  }

  /**
   * 📋 GET ALL EXECUTIONS (OPTIONAL)
   */
  async getAllExecutions() {
    return Execution.find().sort({ createdAt: -1 });
  }
}

module.exports = new ExecutionService();
