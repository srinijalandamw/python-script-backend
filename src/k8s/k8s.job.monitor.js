const k8s = require("@kubernetes/client-node");
const { Writable } = require("stream");
const { getDB } = require("../config/db.config");
const AWS = require("aws-sdk");

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

const requiredEnv = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
  "K8S_NAMESPACE",
];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing env var: ${envVar}`);
    process.exit(1);
  }
}

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET;

const kc = new k8s.KubeConfig();
if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}
const watch = new k8s.Watch(kc);
const NAMESPACE = process.env.K8S_NAMESPACE;

const activeStreams = new Set();
const completedPods = new Set();
const logBuffer = {};

// Record the exact moment this monitor starts
const MONITOR_START_TIME = new Date();

async function waitForS3Object(key, maxWaitSec = 30, intervalSec = 2) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWaitSec) {
    try {
      await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();
      return true;
    } catch (err) {
      if (err.code !== "NotFound") throw err;
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
  }
  return false;
}

function buildMinimalLogsFromString(rawContent) {
  const cleanedContent = rawContent.replace(/OUTPUT_JSON_START[\s\S]*?OUTPUT_JSON_END/g, '');
  const lines = cleanedContent.split(/\r?\n/);
  const minimal = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.includes("% Total") || trimmed.includes("Dload") || trimmed.includes("Upload") ||
      trimmed.includes("Archive:") || trimmed.includes("extracting:") || trimmed.includes("inflating:") ||
      trimmed.includes("Collecting ") || trimmed.includes("Downloading ") ||
      trimmed.includes("Installing collected packages") || trimmed.includes("Successfully installed") ||
      trimmed.includes("WARNING: Running pip") || trimmed.includes("[notice] A new release of pip") ||
      trimmed.includes("[notice] To update, run") || trimmed.includes("📁 Final shared contents:") ||
      trimmed === "/shared:" || trimmed.startsWith("logs.txt") || trimmed.startsWith("metadata.json") ||
      trimmed.startsWith("output.json") || trimmed.includes("Requirement already satisfied") ||
      trimmed.match(/^\d+\s+\d+\s+\d+/)
    ) {
      continue;
    }
    const withoutTimestamp = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/, "");
    minimal.push(withoutTimestamp);
  }
  return minimal.slice(-30);
}

function extractScriptError(logsContent) {
  if (!logsContent) return null;
  const lines = logsContent.split(/\r?\n/);
  const errorLines = [];
  for (const line of lines) {
    if (line.includes("Error") || line.includes("Exception") || line.includes("Traceback") ||
        line.includes("404") || line.includes("failed") || line.includes("curl") ||
        line.includes("❌") || line.includes("SCRIPT_") || line.includes("UNZIP_FAILED") ||
        line.includes("ModuleNotFoundError") || line.includes("SyntaxError") ||
        line.includes("FileNotFoundError") || line.includes("ConnectionError")) {
      errorLines.push(line.trim());
      if (errorLines.length >= 5) break;
    }
  }
  return errorLines.length ? errorLines.join("\n") : null;
}

function categorizeFailure(podTerminationReason, podExitMessage, scriptError, exitCode) {
  if (podTerminationReason === "OOMKilled") {
    return { errorCode: "POD_OOM_KILLED", errorMessage: "Container ran out of memory. Increase memory limits." };
  }
  if (podTerminationReason === "Evicted") {
    return { errorCode: "POD_EVICTED", errorMessage: "Pod evicted due to node pressure." };
  }
  if (scriptError && scriptError.includes("SCRIPT_DOWNLOAD_FAILED")) {
    return { errorCode: "DOWNLOAD_FAILED", errorMessage: "Could not download script.zip. Check S3 key, bucket permissions, or signed URL expiry." };
  }
  if (scriptError && scriptError.includes("UNZIP_FAILED")) {
    return { errorCode: "UNZIP_FAILED", errorMessage: "ZIP extraction failed. Ensure archive is not corrupt and contains valid files." };
  }
  if (scriptError && scriptError.includes("ModuleNotFoundError")) {
    const match = scriptError.match(/ModuleNotFoundError: No module named '(\w+)'/);
    const module = match ? match[1] : "unknown";
    return { errorCode: "MISSING_DEPENDENCY", errorMessage: `Python module '${module}' not found. Add '${module}' to requirements.txt.` };
  }
  if (scriptError && (scriptError.includes("SyntaxError") || scriptError.includes("IndentationError"))) {
    return { errorCode: "SYNTAX_ERROR", errorMessage: "Script contains syntax errors. Check main.py for typos." };
  }
  if (scriptError && scriptError.includes("FileNotFoundError")) {
    return { errorCode: "FILE_NOT_FOUND", errorMessage: "Script tried to open a file that does not exist. Check file paths." };
  }
  if (scriptError && scriptError.includes("ConnectionError")) {
    return { errorCode: "NETWORK_ERROR", errorMessage: "Script failed to connect to external API. Check URL and network connectivity." };
  }
  if (exitCode !== 0) {
    return { errorCode: "SCRIPT_FAILURE", errorMessage: scriptError || "Script failed with non-zero exit code. See logs for details." };
  }
  return { errorCode: null, errorMessage: null };
}

async function fetchPodLogsFromAPI(podName) {
  try {
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    const logStream = await k8sApi.readNamespacedPodLog(
      podName,
      NAMESPACE,
      "runner",
      undefined, undefined, undefined, undefined, undefined
    );
    return logStream.body || "";
  } catch (err) {
    console.error(`Failed to fetch pod logs from API for ${podName}:`, err.message);
    return null;
  }
}

async function streamLogs(podName) {
  const log = new k8s.Log(kc);
  logBuffer[podName] = [];
  const writable = new Writable({
    write(chunk, enc, cb) {
      const line = chunk.toString();
      logBuffer[podName].push(line);
      process.stdout.write(line);
      cb();
    },
  });
  try {
    await log.log(NAMESPACE, podName, "runner", writable, { follow: true, timestamps: true });
  } catch (err) {
    // ignore – pod may have terminated
  }
}

function startRealTimeMonitor() {
  console.log("📡 Kubernetes monitor started");

  watch.watch(
    `/api/v1/namespaces/${NAMESPACE}/pods`,
    {},
    async (type, pod) => {
      try {
        const podName = pod.metadata?.name;
        const jobName = pod.metadata?.labels?.job;
        if (!podName || !jobName) return;
        if (!jobName.startsWith("gsd")) return;

        // Skip pods that were created before this monitor started
        const creationTimestamp = pod.metadata?.creationTimestamp;
        if (creationTimestamp && new Date(creationTimestamp) < MONITOR_START_TIME) {
          // Pod created before monitor start – ignore completely
          return;
        }

        const phase = pod.status?.phase;
        const isTerminated = pod.status?.containerStatuses?.[0]?.state?.terminated;

        if (!isTerminated && phase !== "Succeeded" && phase !== "Failed" && !activeStreams.has(podName)) {
          activeStreams.add(podName);
          streamLogs(podName).catch(err => console.error(`Live log stream error for ${podName}:`, err.message));
        }

        if (isTerminated && !completedPods.has(podName)) {
          completedPods.add(podName);
          await handleCompletion(podName, jobName, isTerminated.exitCode);
        }
      } catch (err) {
        console.error("Watch error:", err.message);
      }
    },
    (err) => {
      console.error("Watch crashed:", err);
      setTimeout(startRealTimeMonitor, 5000);
    }
  );
}

async function handleCompletion(podName, jobName, exitCode) {
  try {
    const db = getDB();
    const executions = db.collection("executions");
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    let podTerminationReason = null;
    let podExitMessage = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const pod = await k8sApi.readNamespacedPod(podName, NAMESPACE);
        const containerStatus = pod.body.status?.containerStatuses?.[0];
        if (containerStatus?.state?.terminated) {
          podTerminationReason = containerStatus.state.terminated.reason;
          podExitMessage = containerStatus.state.terminated.message;
          break;
        }
      } catch (err) {
        console.warn(`Could not fetch pod details (attempt ${attempt+1}):`, err.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`Pod termination reason: ${podTerminationReason || "N/A"}`);
    if (podExitMessage) console.log(`Pod exit message: ${podExitMessage}`);

    const finalStatus = exitCode === 0 ? "SUCCESS" : "FAILED";
    await executions.updateOne(
      { processId: jobName },
      {
        $set: {
          status: finalStatus,
          finishedAt: new Date(),
          updatedAt: new Date(),
          podTerminationReason,
          podExitMessage,
        },
      }
    );

    const basePath = `outputs/executions/${jobName}`;
    let logsContent = null;
    let finalLogsKey = null;

    const logsKey = `${basePath}/logs.txt`;
    const logsExist = await waitForS3Object(logsKey, 30, 3);
    if (logsExist) {
      const s3Object = await s3.getObject({ Bucket: BUCKET_NAME, Key: logsKey }).promise();
      logsContent = s3Object.Body.toString("utf-8");
      finalLogsKey = logsKey;
      console.log(`✅ Logs retrieved from S3: ${logsKey}`);
    } else if (logBuffer[podName] && logBuffer[podName].length > 0) {
      logsContent = logBuffer[podName].join("\n");
      const fallbackKey = `${basePath}/logs-fallback.txt`;
      await s3.putObject({ Bucket: BUCKET_NAME, Key: fallbackKey, Body: logsContent, ContentType: "text/plain" }).promise();
      finalLogsKey = fallbackKey;
      console.log(`⚠️ Logs from buffer uploaded to ${fallbackKey}`);
    } else {
      console.log(`📡 Fetching logs directly from K8s API for ${podName}`);
      logsContent = await fetchPodLogsFromAPI(podName);
      if (logsContent) {
        const apiFallbackKey = `${basePath}/logs-k8s-api-fallback.txt`;
        await s3.putObject({ Bucket: BUCKET_NAME, Key: apiFallbackKey, Body: logsContent, ContentType: "text/plain" }).promise();
        finalLogsKey = apiFallbackKey;
        console.log(`✅ Logs from K8s API uploaded to ${apiFallbackKey}`);
      } else {
        console.error(`❌ No logs available for ${jobName} from any source`);
      }
    }

    const minimalLogs = logsContent ? buildMinimalLogsFromString(logsContent) : [];
    const scriptError = logsContent ? extractScriptError(logsContent) : null;
    const { errorCode, errorMessage } = categorizeFailure(podTerminationReason, podExitMessage, scriptError, exitCode);

    if (finalStatus === "FAILED") {
      console.log(`❌ Job ${jobName} failed`);
      if (errorCode) console.log(`   Error code: ${errorCode}`);
      if (errorMessage) console.log(`   Message: ${errorMessage}`);
      if (scriptError) console.log(`   Script error: ${scriptError}`);
    } else {
      console.log(`✅ Job ${jobName} completed successfully`);
    }

    let outputExist = false;
    try {
      await s3.headObject({ Bucket: BUCKET_NAME, Key: `${basePath}/output.json` }).promise();
      outputExist = true;
    } catch (e) {}

    const updateFields = {
      logsStorageKey: finalLogsKey,
      outputStorageKey: outputExist ? `${basePath}/output.json` : null,
      artifactPrefix: `${basePath}/`,
      logs: minimalLogs,
      scriptError,
      errorCode,
      errorMessage,
    };
    await executions.updateOne({ processId: jobName }, { $set: updateFields });

    delete logBuffer[podName];
    activeStreams.delete(podName);
    console.log(`✅ Completion handler finished for ${jobName}`);
  } catch (err) {
    console.error(`Completion error for ${jobName}:`, err.message);
  }
}

module.exports = { startRealTimeMonitor };