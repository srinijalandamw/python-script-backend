/**
 * ============================================================
 * 🚀 PRODUCTION K8S REAL-TIME MONITOR (FINAL STABLE)
 * ============================================================
 */

const k8s = require("@kubernetes/client-node");
const Execution = require("../models/execution.model");
const { storeOutput } = require("../utils/storage");

const kc = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const watch = new k8s.Watch(kc);
const coreV1 = kc.makeApiClient(k8s.CoreV1Api);

/**
 * ✅ SAFE NAMESPACE
 */
function getNamespace() {
  const ns = process.env.K8S_NAMESPACE;
  if (!ns || !ns.trim()) {
    throw new Error("❌ K8S_NAMESPACE missing");
  }
  return ns.trim();
}

const NAMESPACE = getNamespace();

/**
 * 🧠 STATE TRACKING
 */
const activeStreams = new Set();
const completedPods = new Set();

/**
 * 🚀 START MONITOR
 */
function startRealTimeMonitor() {
  console.log("🚀 Kubernetes REAL-TIME monitor started...");

  watch.watch(
    `/api/v1/namespaces/${NAMESPACE}/pods`,
    {}, // 🔥 DO NOT FILTER HERE (we filter manually)

    async (type, pod) => {
      try {
        const podName = pod.metadata?.name;
        const jobName = pod.metadata?.labels?.job;

        if (!podName || !jobName) return;

        /**
         * 🔥 ONLY HANDLE OUR JOBS
         */
        if (!jobName.startsWith("job-")) return;

        console.log(`📡 Pod Event: ${type} → ${podName}`);

        /**
         * 🟢 STREAM LOGS (SAFE)
         */
        const isRunning =
          pod.status?.containerStatuses?.[0]?.state?.running;

        if (isRunning && !activeStreams.has(podName)) {
          activeStreams.add(podName);
          safeStreamLogs(podName);
        }

        /**
         * 🔴 COMPLETION HANDLER
         */
        const phase = pod.status?.phase;

        if (
          (phase === "Succeeded" || phase === "Failed") &&
          !completedPods.has(podName)
        ) {
          completedPods.add(podName);

          console.log("🔥 Handling completion:", podName);

          await handleCompletion(podName, jobName, phase);
        }
      } catch (err) {
        console.error("❌ Watch error:", err.message);
      }
    },

    (err) => {
      console.error("❌ Watch crashed:", err);
      setTimeout(startRealTimeMonitor, 5000);
    }
  );
}

/**
 * 📡 SAFE LOG STREAM (NO CRASH)
 */
function safeStreamLogs(podName) {
  const log = new k8s.Log(kc);

  try {
    log.log(
      NAMESPACE,
      podName,
      "runner",
      process.stdout,
      {
        follow: true,
        pretty: false,
      },
      (err) => {
        if (err) {
          console.warn("⚠️ Stream closed:", podName);
        }
      }
    );
  } catch (err) {
    console.warn("⚠️ Stream failed:", err.message);
  }
}

/**
 * 🔥 HANDLE COMPLETION (PRODUCTION SAFE)
 */
async function handleCompletion(podName, jobName, phase) {
  try {
    /**
     * 🟢 EARLY STATUS UPDATE (CRITICAL FIX)
     * This ensures Mongo is updated instantly when job completes
     */
    const finalStatus = phase === "Succeeded" ? "SUCCESS" : "FAILED";

    await Execution.findOneAndUpdate(
      { processId: jobName },
      {
        status: finalStatus,
        finishedAt: new Date(),
      }
    );

    console.log("⚡ Early Mongo update done:", jobName);

    /**
     * ⏳ RETRY LOG FETCH (POD MAY TERMINATE FAST)
     */
    let logs = [];

    for (let i = 0; i < 5; i++) {
      try {
        const res = await coreV1.readNamespacedPodLog({
          name: podName,
          namespace: NAMESPACE,
        });

        logs = res.split("\n").filter(Boolean);

        if (logs.length > 0) break;
      } catch (err) {
        await sleep(1000);
      }
    }

    console.log(`📜 Final logs fetched: ${logs.length}`);

    /**
     * 💾 SAVE LOGS
     */
    await Execution.findOneAndUpdate(
      { processId: jobName },
      {
        logs: logs.map((l) => ({
          message: l,
          createdAt: new Date(),
        })),
      }
    );

    /**
     * 📦 EXTRACT OUTPUT
     */
    const output = extractOutput(logs);

    let outputKey = null;

    if (output) {
      outputKey = `executions/${jobName}/output.json`;

      console.log("📦 Uploading output to S3...");

      await storeOutput(
        outputKey,
        Buffer.from(JSON.stringify(output, null, 2))
      );
    }

    /**
     * 🟢 FINAL PATCH UPDATE (NO STATUS TOUCH)
     * Only attach output key (do NOT overwrite status again)
     */
    await Execution.findOneAndUpdate(
      { processId: jobName },
      {
        outputStorageKey: outputKey,
      }
    );

    console.log("🎉 Mongo fully updated for:", jobName);
  } catch (err) {
    console.error("❌ Completion failed:", err.message);
  }
}


/**
 * 🔥 ROBUST OUTPUT PARSER (FINAL FIX)
 */
function extractOutput(logs) {
  try {
    const starts = [];
    const ends = [];

    logs.forEach((l, i) => {
      if (l.includes("OUTPUT_JSON_START")) starts.push(i);
      if (l.includes("OUTPUT_JSON_END")) ends.push(i);
    });

    if (!starts.length || !ends.length) return null;

    let start = -1;
    let end = -1;

    for (let i = starts.length - 1; i >= 0; i--) {
      const s = starts[i];
      const e = ends.find((ei) => ei > s);

      if (e) {
        start = s;
        end = e;
        break;
      }
    }

    if (start === -1 || end === -1) return null;

    const raw = logs.slice(start + 1, end).join("").trim();

    const firstBrace = raw.indexOf("{");
    if (firstBrace === -1) return null;

    const clean = raw.slice(firstBrace);

    return JSON.parse(clean);
  } catch (err) {
    console.error("❌ Output parse error:", err.message);
    return null;
  }
}

/**
 * 💤 UTILS
 */
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

module.exports = {
  startRealTimeMonitor,
};
