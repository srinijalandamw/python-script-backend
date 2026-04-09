/**
 * 📦 EXECUTION MODEL (PRODUCTION - K8s COMPATIBLE)
 */

const mongoose = require("mongoose");

/**
 * 🧾 LOG SCHEMA
 * Stores logs line-by-line with timestamp
 */
const logSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/**
 * 🚀 EXECUTION SCHEMA
 */
const executionSchema = new mongoose.Schema(
  {
    scriptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    version: {
      type: String,
      required: true,
    },

    /**
     * 🔥 PROCESS ID (IMPORTANT)
     * In K8s → this is JOB NAME
     * Example: job-65f0abc123...
     */
    processId: {
      type: String,
      index: true,
    },

    /**
     * 📥 INPUT JSON
     */
    input: {
      type: Object,
      default: {},
    },

    /**
     * 📊 STATUS TRACKING
     */
    status: {
      type: String,
      enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true,
    },

    /**
     * 📜 EXECUTION LOGS
     */
    logs: {
      type: [logSchema],
      default: [],
    },

    /**
     * 📦 OUTPUT LOCATION (S3)
     */
    outputStorageKey: {
      type: String,
      default: null,
    },

    /**
     * ⏱ TIMESTAMPS
     */
    startedAt: Date,
    finishedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Execution", executionSchema);
