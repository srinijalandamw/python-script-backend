/* Polls Kubernetes
Gets logs
Extracts output
Stores output
Updates MongoDB 
*/


const k8s = require("@kubernetes/client-node");
const Execution = require("../modules/executions/execution.model");
const { storeOutput } = require("../utils/storage");

const kc = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const batchV1 = kc.makeApiClient(k8s.BatchV1Api);
const coreV1 = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = "default";

function startJobMonitor() {
  console.log("📡 K8s Job Monitor started...");

  setInterval(async () => {
    try {
      console.log("🔍 Checking K8s job status...");

      const res = await batchV1.listNamespacedJob({
        namespace: NAMESPACE,
      });

      const jobs = res?.items || [];

      for (const job of jobs) {
        try {
          const jobName = job?.metadata?.name;
          const jobStatus = job?.status || {};

          if (!jobName) continue;

          const executionId = jobName.replace("job-", "");

          const execution = await Execution.findById(executionId);
          if (!execution) continue;

          // ✅ prevent reprocessing
          if (["SUCCESS", "FAILED", "PROCESSING"].includes(execution.status)) {
            continue;
          }

          // =========================
          // ✅ SUCCESS
          // =========================
          if (jobStatus.succeeded) {
            console.log(`✅ Job completed: ${jobName}`);

            // 🔒 LOCK
            const locked = await Execution.findOneAndUpdate(
              { _id: executionId, status: { $ne: "SUCCESS" } },
              { status: "PROCESSING" }
            );

            if (!locked) continue;

            const podName = await getPodName(jobName);
            const logs = await getPodLogs(podName);

            const output = extractOutputFromLogs(logs);

            let storageKey = null;

            if (output) {
              console.log("📦 Storing output...");
              storageKey = await storeOutput(executionId, output);
            } else {
              console.log("⚠️ No output found in logs");
            }

            await Execution.findByIdAndUpdate(executionId, {
              status: "SUCCESS",
              finishedAt: new Date(),
              logs: logs.map((l) => ({ message: l })),
              outputs: output?.outputs || [],
              outputStorageKey: storageKey,
            });

            continue;
          }

          // =========================
          // ❌ FAILED
          // =========================
          if (jobStatus.failed) {
            console.log(`❌ Job failed: ${jobName}`);

            const podName = await getPodName(jobName);
            const logs = await getPodLogs(podName);

            await Execution.findByIdAndUpdate(executionId, {
              status: "FAILED",
              finishedAt: new Date(),
              logs: logs.map((l) => ({ message: l })),
            });

            continue;
          }
        } catch (err) {
          console.error(`❌ Error for job ${job?.metadata?.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error("❌ Monitor Error:", err.message);
    }
  }, 5000);
}

/**
 * 📦 GET POD NAME
 */
async function getPodName(jobName) {
  const res = await coreV1.listNamespacedPod({
    namespace: NAMESPACE,
    labelSelector: `job-name=${jobName}`,
  });

  return res?.items?.[0]?.metadata?.name;
}

/**
 * 📥 GET POD LOGS
 */
async function getPodLogs(podName) {
  try {
    if (!podName) return [];

    const logRes = await coreV1.readNamespacedPodLog({
      name: podName,
      namespace: NAMESPACE,
    });

    return logRes.split("\n").filter((l) => l.trim() !== "");
  } catch (err) {
    console.error("⚠️ Log fetch failed:", err.message);
    return [];
  }
}

/**
 * 🔥 EXTRACT OUTPUT JSON
 */
function extractOutputFromLogs(logs) {
  try {
    const start = logs.findIndex((l) => l.includes("OUTPUT_JSON_START"));
    const end = logs.findIndex((l) => l.includes("OUTPUT_JSON_END"));

    if (start === -1 || end === -1) return null;

    const jsonString = logs.slice(start + 1, end).join("");

    const parsed = JSON.parse(jsonString);

    console.log("✅ Output JSON extracted");

    return parsed;
  } catch (err) {
    console.error("⚠️ Output parse failed:", err.message);
    return null;
  }
}

module.exports = {
  startJobMonitor,
};