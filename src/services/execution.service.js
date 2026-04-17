/**
 * 🚀 EXECUTION SERVICE (FINAL - TRITON + K8s ALIGNED)
 */

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
      const db = getDB();
      if (!db) throw new Error("❌ DB not initialized");

      const executions = db.collection("executions");
      const scriptVersions = db.collection("scriptversions");

      /**
       * 1️⃣ CREATE EXECUTION
       */
      const executionDoc = {
        scriptId: new ObjectId(scriptId),
        version,
        inputs: input,

        status: "PENDING",
        logs: [],

        //output: null,
        outputStorageKey: null,
        logsStorageKey: null, // ✅ NEW

        processId: null,

        startedAt: null,
        finishedAt: null,

        createdAt: new Date(),
        updatedAt: new Date(),

        executedBy: userId || "system",
      };

      const insertResult = await executions.insertOne(executionDoc);
      const executionId = insertResult.insertedId;

      /**
       * 2️⃣ PROCESS ID
       */
      const processId = generateProcessId(executionId);

      await executions.updateOne(
        { _id: executionId },
        { $set: { processId } }
      );

      console.log("🆔 Process ID:", processId);

      /**
       * 3️⃣ FETCH SCRIPT VERSION
       */
      const scriptVersion = await scriptVersions.findOne({
        scriptId: new ObjectId(scriptId),
        version,
        isActive: true,
      });

      if (!scriptVersion) {
        throw new Error("❌ Script version not found");
      }

      /**
       * 4️⃣ SIGNED URL (IMPORTANT: s3Key)
       */
      const scriptUrl = await getSignedFileUrl(scriptVersion.s3Key);

      /**
       * 5️⃣ TRIGGER K8s JOB
       */
      await createJob(processId, scriptUrl, input);

      /**
       * 6️⃣ UPDATE STATUS
       */
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

      return {
        _id: executionId,
        processId,
        status: "RUNNING",
      };
    } catch (err) {
      console.error("❌ ExecutionService Error:", err.message);
      throw err;
    }
  }

  async getExecution(executionId) {
    const db = getDB();
    return db.collection("executions").findOne({
      _id: new ObjectId(executionId),
    });
  }

  async getAllExecutions() {
    const db = getDB();
    return db
      .collection("executions")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
  }
}

module.exports = new ExecutionService();
