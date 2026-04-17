const k8s = require("@kubernetes/client-node");
const { Writable } = require("stream");
const { getDB } = require("../config/db.config");
const AWS = require("aws-sdk");

// ===============================
//  Validate required environment variables
// ===============================
const requiredEnv = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
  "K8S_NAMESPACE",
];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required env var: ${envVar}`);
    process.exit(1);
  }
}

// ===============================
//  AWS S3 Configuration
// ===============================
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET;

// ===============================
//  Kubernetes Setup
// ===============================
const kc = new k8s.KubeConfig();
if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}
const watch = new k8s.Watch(kc);
const NAMESPACE = process.env.K8S_NAMESPACE;

// ===============================
//  In‑memory state
// ===============================
const activeStreams = new Set();
const completedPods = new Set();
const logBuffer = {};

// ===============================
//  Helper: Sanitize S3 keys
// ===============================
function sanitizeKey(key) {
  return key.replace(/\/+/g, "/");
}

// ===============================
//  Upload to S3
// ===============================
async function uploadToS3(key, buffer, contentType = "text/plain") {
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET is not defined");
  }
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };
  await s3.putObject(params).promise();
  return key;
}

// ===============================
//  Start watching pods
// ===============================
function startRealTimeMonitor() {
  console.log("Kubernetes real-time monitor started");

  watch.watch(
    `/api/v1/namespaces/${NAMESPACE}/pods`,
    {},
    async (type, pod) => {
      try {
        const podName = pod.metadata?.name;
        const jobName = pod.metadata?.labels?.job;

        if (!podName || !jobName) return;
        if (!jobName.startsWith("gsd-py-runner-job-")) return;

        const isRunning = pod.status?.containerStatuses?.[0]?.state?.running;
        if (isRunning && !activeStreams.has(podName)) {
          activeStreams.add(podName);
          streamPodLogs(podName);
        }

        const terminated = pod.status?.containerStatuses?.[0]?.state?.terminated;
        if (terminated && !completedPods.has(podName)) {
          completedPods.add(podName);
          await handleCompletion(
            podName,
            jobName,
            terminated.exitCode === 0 ? "Succeeded" : "Failed"
          );
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

// ===============================
//  Stream logs in real time
// ===============================
function streamPodLogs(podName) {
  const log = new k8s.Log(kc);
  logBuffer[podName] = [];

  const writable = new Writable({
    write(chunk, encoding, callback) {
      const line = chunk.toString();
      logBuffer[podName].push(line);
      process.stdout.write(line);
      callback();
    },
  });

  log.log(
    NAMESPACE,
    podName,
    "runner",
    writable,
    { follow: true, timestamps: true },
    () => {}
  );
}

// ===============================
//  Get collected logs for a pod
// ===============================
function getLogs(podName) {
  return logBuffer[podName] || [];
}

// ===============================
//  Minimal logs for MongoDB (keep timestamps, only important lines)
// ===============================
function buildMinimalLogs(rawLogs) {
  const minimal = [];

  for (const line of rawLogs) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip known noise lines
    if (
      trimmed.includes("% Total") ||
      trimmed.includes("Dload") ||
      trimmed.includes("Upload") ||
      trimmed.includes("OUTPUT_JSON_START") ||
      trimmed.includes("OUTPUT_JSON_END") ||
      trimmed.includes("Archive:") ||
      trimmed.includes("inflating:") ||
      trimmed.includes("extracting:") ||
      trimmed.includes("Requirement already satisfied") ||
      trimmed.includes("WARNING: Running pip as") ||
      trimmed.includes("[notice] A new release of pip") ||
      trimmed.includes("[notice] To update, run")
    ) {
      continue;
    }

    // Extract timestamp and message (first space separates them)
    const firstSpace = trimmed.indexOf(" ");
    let ts = "";
    let msg = trimmed;
    if (firstSpace > 0) {
      ts = trimmed.substring(0, firstSpace);
      msg = trimmed.substring(firstSpace + 1);
    }

    // Keep lines that are important for execution visibility
    const isImportant =
      msg.includes("🚀") ||
      msg.includes("✅") ||
      msg.includes("▶️") ||
      msg.includes("📥") ||
      msg.includes("📦") ||
      msg.includes("🏢") ||
      msg.includes("🌐") ||
      msg.includes("📊") ||
      msg.includes("⚙️") ||
      msg.includes("Script started") ||
      msg.includes("Script completed") ||
      msg.includes("Running script...") ||
      msg.includes("DONE") ||
      msg.includes("ERROR") ||
      msg.includes("Exception") ||
      msg.includes("Traceback") ||
      msg.includes("FAILED") ||
      // Keep actual JSON output lines (they contain "outputs")
      (msg.includes('"outputs"') && msg.includes("{") && msg.includes("}"));

    if (isImportant) {
      minimal.push(`[${ts}] ${msg}`);
    }
  }

  return minimal.slice(-30);
}

// ===============================
//  Extract JSON output – strips timestamps only for parsing
// ===============================
function extractOutput(logs) {
  try {
    const startIdx = logs.findIndex((l) => l.includes("OUTPUT_JSON_START"));
    const endIdx = logs.findIndex((l) => l.includes("OUTPUT_JSON_END"));
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

    // Extract lines between markers
    const blockLines = logs.slice(startIdx + 1, endIdx);

    // Remove Kubernetes timestamp prefix from each line (for parsing only)
    // Pattern matches: 2026-04-16T14:41:17.200151160Z (followed by space)
    const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/;
    const cleanedLines = blockLines.map((line) =>
      line.replace(timestampPattern, "").trim()
    );

    const rawBlock = cleanedLines.join("\n").trim();
    // Remove ANSI escape codes
    const cleanBlock = rawBlock.replace(/\u001b\[.*?m/g, "");

    // Find the first '{' and matching '}'
    const firstBrace = cleanBlock.indexOf("{");
    let lastBrace = -1;
    let braceCount = 0;
    for (let i = firstBrace; i < cleanBlock.length; i++) {
      if (cleanBlock[i] === "{") braceCount++;
      if (cleanBlock[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          lastBrace = i;
          break;
        }
      }
    }
    if (firstBrace === -1 || lastBrace === -1) return null;

    const jsonString = cleanBlock.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonString);
  } catch (err) {
    console.error("Output parse failed:", err.message);
    return null;
  }
}

// ===============================
//  Idempotent completion handler with enhanced error logging
// ===============================
async function handleCompletion(podName, jobName, phase) {
  try {
    const db = getDB();
    const executions = db.collection("executions");

    // Idempotency check
    const existing = await executions.findOne({ processId: jobName });
    if (existing?.logsStorageKey) {
      console.log(`Execution ${jobName} already processed. Skipping.`);
      return;
    }

    // Get pod details for better error context
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    let podTerminationReason = null;
    let podExitMessage = null;
    try {
      const pod = await k8sApi.readNamespacedPod(podName, NAMESPACE);
      const containerStatus = pod.body.status?.containerStatuses?.[0];
      if (containerStatus?.state?.terminated) {
        podTerminationReason = containerStatus.state.terminated.reason;
        podExitMessage = containerStatus.state.terminated.message;
      }
    } catch (err) {
      console.warn(`Could not fetch pod details: ${err.message}`);
    }

    // Update status and finishedAt
    const finalStatus = phase === "Succeeded" ? "SUCCESS" : "FAILED";
    await executions.updateOne(
      { processId: jobName },
      {
        $set: {
          status: finalStatus,
          finishedAt: new Date(),
          ...(podTerminationReason && { podTerminationReason }),
          ...(podExitMessage && { podExitMessage }),
        },
      }
    );

    // Wait for logs to flush
    await new Promise((res) => setTimeout(res, 1500));

    const rawLogs = getLogs(podName).filter(Boolean);

    // ===============================
    //  CORRECT S3 PATHS (full logs)
    // ===============================
    const basePath = `outputs/executions/${jobName}`;
    const logsKey = sanitizeKey(`${basePath}/logs.txt`);
    const outputKey = sanitizeKey(`${basePath}/output.json`);

    // Upload full raw logs to S3
    const fullLogsBuffer = Buffer.from(rawLogs.join("\n"));
    await uploadToS3(logsKey, fullLogsBuffer, "text/plain");
    console.log(`📦 Full logs uploaded to s3://${BUCKET_NAME}/${logsKey}`);

    // Extract output JSON with better error logging
    let finalOutputKey = null;
    let outputExtractError = null;
    const output = extractOutput(rawLogs);

    if (output) {
      const outputBuffer = Buffer.from(JSON.stringify(output, null, 2));
      await uploadToS3(outputKey, outputBuffer, "application/json");
      finalOutputKey = outputKey;
      console.log(`📦 Output JSON uploaded to s3://${BUCKET_NAME}/${outputKey}`);
    } else {
      // Determine why extraction failed
      const hasStart = rawLogs.some((l) => l.includes("OUTPUT_JSON_START"));
      const hasEnd = rawLogs.some((l) => l.includes("OUTPUT_JSON_END"));
      if (!hasStart || !hasEnd) {
        outputExtractError = "Script did not output OUTPUT_JSON_START/END markers";
      } else {
        outputExtractError = "JSON parsing failed – check if the script printed valid JSON between markers";
      }
      console.warn(`⚠️ Output extraction failed for ${jobName}: ${outputExtractError}`);
    }

    // ===============================
    //  Minimal logs for MongoDB (keep timestamps)
    // ===============================
    const minimalLogs = buildMinimalLogs(rawLogs);

    // If the pod failed, append termination reason and extraction errors to logs
    const finalLogs = [...minimalLogs];
    if (finalStatus === "FAILED") {
      if (podTerminationReason) {
        finalLogs.push(
          `[SYSTEM] Pod terminated: ${podTerminationReason}${podExitMessage ? ` - ${podExitMessage}` : ""}`
        );
      }
      if (outputExtractError) {
        finalLogs.push(`[SYSTEM] Output extraction issue: ${outputExtractError}`);
      }
    }

    // Update MongoDB with minimal logs and S3 keys
    await executions.updateOne(
      { processId: jobName },
      {
        $set: {
          logs: finalLogs,
          logsStorageKey: logsKey,
          outputStorageKey: finalOutputKey,
          updatedAt: new Date(),
          ...(outputExtractError && { outputExtractError }),
        },
      }
    );

    // Clean up memory
    delete logBuffer[podName];
    activeStreams.delete(podName);

    console.log(`✅ Execution completed: ${jobName} (${finalStatus})`);
  } catch (err) {
    console.error("Completion failed:", err.message);
  }
}

module.exports = {
  startRealTimeMonitor,
};