/**
 * 🚀 EXECUTION SERVICE (FINAL - NATIVE MONGO + K8s)
 *
 * RESPONSIBILITIES:
 * - Create execution record (Mongo)
 * - Generate processId
 * - Fetch script version (Mongo)
 * - Generate signed S3 URL
 * - Trigger Kubernetes Job
 */

const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db.config"); // 🔥 IMPORTANT
const { createJob } = require("../k8s/k8s.client");
const { getSignedFileUrl } = require("../utils/storage/s3");

/**
 * 🧠 GENERATE PROCESS ID
 */
function generateProcessId(executionId) {
  return `job-${executionId}`;
}

class ExecutionService {
  /**
   * 🚀 CREATE EXECUTION
   */
  async createExecution(scriptId, version, input = {}, userId) {
    try {
      const db = getDB();

      if (!db) {
        throw new Error("❌ DB not initialized");
      }

      const executionsCollection = db.collection("executions");
      const scriptVersionsCollection = db.collection("scriptversions");

      /**
       * ============================================================
       * 1️⃣ CREATE EXECUTION ENTRY
       * ============================================================
       */
      const executionDoc = {
        scriptId: new ObjectId(scriptId),
        version,
        input,
        status: "PENDING",
        logs: [],
        outputStorageKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        finishedAt: null,
        processId: null,
        createdBy: userId || "system",
      };

      const insertResult = await executionsCollection.insertOne(executionDoc);

      const executionId = insertResult.insertedId;

      /**
       * ============================================================
       * 2️⃣ GENERATE PROCESS ID
       * ============================================================
       */
      const processId = generateProcessId(executionId);

      await executionsCollection.updateOne(
        { _id: executionId },
        {
          $set: {
            processId,
          },
        }
      );

      console.log("🆔 Process ID:", processId);

      /**
       * ============================================================
       * 3️⃣ FETCH SCRIPT VERSION (🔥 FIXED OBJECTID MATCH)
       * ============================================================
       */
      const scriptVersion = await scriptVersionsCollection.findOne({
        scriptId: new ObjectId(scriptId),
        version,
        isActive: true,
      });

      if (!scriptVersion) {
        throw new Error("❌ Script version not found");
      }

      console.log("✅ Script version found");

      /**
       * ============================================================
       * 4️⃣ GENERATE SIGNED URL
       * ============================================================
       */
      const scriptUrl = await getSignedFileUrl(
        scriptVersion.storageKey
      );

      console.log("🔐 Signed URL generated");

      /**
       * ============================================================
       * 5️⃣ TRIGGER K8s JOB
       * ============================================================
       */
      await createJob(processId, scriptUrl, input);

      console.log("🚀 K8s job triggered");

      /**
       * ============================================================
       * 6️⃣ UPDATE STATUS → RUNNING
       * ============================================================
       */
      await executionsCollection.updateOne(
        { _id: executionId },
        {
          $set: {
            status: "RUNNING",
            startedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      console.log("🔥 Execution running:", processId);

      /**
       * ============================================================
       * 7️⃣ RETURN RESPONSE
       * ============================================================
       */
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

  /**
   * 📄 GET EXECUTION BY ID
   */
  async getExecution(executionId) {
    const db = getDB();
    return db.collection("executions").findOne({
      _id: new ObjectId(executionId),
    });
  }

  /**
   * 📋 GET ALL EXECUTIONS
   */
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
