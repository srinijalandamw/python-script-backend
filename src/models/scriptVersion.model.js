/**
 * 📦 SCRIPT VERSION MODEL
 * 🚀 Executes job
 * Called by worker
 * Calls:
 * script.executor.js → k8s.client.js
 */

const mongoose = require("mongoose");

const scriptVersionSchema = new mongoose.Schema(
  {
    scriptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    version: {
      type: String,
      required: true,
    },

    entrypoint: {
      type: String,
      default: "main.py",
    },

    inputSchema: {
      type: Object,
      default: {},
    },

    storageKey: {
      type: String,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScriptVersion", scriptVersionSchema);