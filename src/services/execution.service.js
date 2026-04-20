const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db.config");
const { createJob } = require("../k8s/k8s.client");
const { getSignedFileUrl } = require("../utils/storage/s3");

function generateProcessId(executionId) {
  return `gsd-py-runner-job-${executionId}`;
}

class ExecutionService {
  async createExecution(scriptId, version, input = {}, userId) {
    try {
      console.log(`📝 Creating execution: scriptId=${scriptId}, version=${version}`);

      const db = getDB();
      if (!db) throw new Error("❌ DB not initialized");

      const executions = db.collection("executions");
      const scriptVersions = db.collection("scriptversions");

      // 1. Validate scriptId
      if (!ObjectId.isValid(scriptId)) {
        throw new Error(`INVALID_SCRIPT_ID: ${scriptId} is not a valid ObjectId`);
      }

      // 2. Check if script version exists
      const scriptVersion = await scriptVersions.findOne({
        scriptId: new ObjectId(scriptId),
        version,
        isActive: true,
      });
      if (!scriptVersion) {
        throw new Error(`SCRIPT_VERSION_NOT_FOUND: No active version ${version} for script ${scriptId}`);
      }
      console.log(`✅ Script version found: ${scriptVersion.s3Key}`);

      // 3. Create execution document
      const executionDoc = {
        scriptId: new ObjectId(scriptId),
        version,
        inputs: input,
        status: "PENDING",
        logs: [],
        outputStorageKey: null,
        logsStorageKey: null,
        processId: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        executedBy: userId || "system",
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
      };

      const insertResult = await executions.insertOne(executionDoc);
      const executionId = insertResult.insertedId;
      const processId = generateProcessId(executionId);
      await executions.updateOne({ _id: executionId }, { $set: { processId } });
      console.log(`🆔 Process ID: ${processId}`);

      // 4. Generate signed URL
      let scriptUrl;
      try {
        scriptUrl = await getSignedFileUrl(scriptVersion.s3Key);
        console.log(`🔐 Signed URL generated for: ${scriptVersion.s3Key}`);
      } catch (err) {
        throw new Error(`SIGNED_URL_FAILED: Could not generate URL for ${scriptVersion.s3Key} - ${err.message}`);
      }

      // 5. Create Kubernetes job
      try {
        await createJob(processId, scriptUrl, input);
        console.log(`✅ Kubernetes job created for ${processId}`);
      } catch (err) {
        throw new Error(`K8S_JOB_CREATION_FAILED: ${err.message}`);
      }

      // 6. Update status to RUNNING
      await executions.updateOne(
        { _id: executionId },
        {
          $set: {
            status: "RUNNING",
            startedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      console.log(`✅ Execution ${executionId} started successfully`);
      return {
        _id: executionId,
        processId,
        status: "RUNNING",
      };
    } catch (err) {
      console.error(`❌ ExecutionService Error: ${err.message}`);
      // Re-throw with the same message so the API can return it
      throw new Error(err.message);
    }
  }

  async getExecution(executionId) {
    const db = getDB();
    return db.collection("executions").findOne({ _id: new ObjectId(executionId) });
  }

  async getAllExecutions() {
    const db = getDB();
    return db.collection("executions").find().sort({ createdAt: -1 }).toArray();
  }
}

module.exports = new ExecutionService();