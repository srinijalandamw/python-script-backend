const k8s = require("@kubernetes/client-node");

const kc = new k8s.KubeConfig();
if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const batchV1 = kc.makeApiClient(k8s.BatchV1Api);

function getNamespace() {
  const ns = process.env.K8S_NAMESPACE;
  if (!ns || !ns.trim()) throw new Error("K8S_NAMESPACE missing");
  return ns.trim();
}

function sanitizeJobName(name) {
  return String(name)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

async function createJob(processId, scriptUrl, input = {}) {
  const ns = getNamespace();
  const jobName = sanitizeJobName(processId);

  const jobManifest = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: jobName },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 300,
      template: {
        metadata: {
          labels: {
            app: "gsd-script-runner",
            job: jobName,
          },
        },
        spec: {
          restartPolicy: "Never",
          volumes: [{ name: "shared-volume", emptyDir: {} }],
          containers: [
            // ========================
            // MAIN RUNNER (with detailed error messages)
            // ========================
            {
              name: "runner",
              image: "monicab2026/gsd-python-runner:latest",
              env: [
                { name: "INPUT_JSON", value: JSON.stringify(input || {}) },
                { name: "SCRIPT_URL", value: scriptUrl },
              ],
              volumeMounts: [{ name: "shared-volume", mountPath: "/shared" }],
              command: ["sh", "-c"],
              args: [
                `
set -e

echo "🚀 STARTING EXECUTION"
echo "📥 Downloading script from $SCRIPT_URL"

if ! curl -f -o script.zip "$SCRIPT_URL"; then
  echo "❌ SCRIPT_DOWNLOAD_FAILED: HTTP error (curl exit code $?)"
  echo "   URL: $SCRIPT_URL"
  echo "   Please check:"
  echo "     1. S3 key exists and is public-readable (or signed URL valid)"
  echo "     2. Network connectivity to S3"
  echo "     3. No firewall blocking egress"
  echo '{"exitCode":1,"reason":"download_failed","url":"$SCRIPT_URL"}' > /shared/metadata.json
  exit 1
fi

echo "✅ Script downloaded successfully ($(stat -c%s script.zip) bytes)"

echo "📦 Extracting..."
if ! unzip -o script.zip; then
  echo "❌ UNZIP_FAILED: Archive may be corrupt or password protected"
  echo '{"exitCode":1,"reason":"unzip_failed"}' > /shared/metadata.json
  exit 1
fi

echo "$INPUT_JSON" > input.json

if [ -f requirements.txt ]; then
  echo "📦 Installing dependencies from requirements.txt..."
  pip install -r requirements.txt
  if [ $? -ne 0 ]; then
    echo "⚠️ DEPENDENCY_INSTALL_WARNING: Some packages failed to install"
    echo "   Continuing anyway..."
  fi
fi

echo "▶️ Running script..."
python main.py 2>&1 | tee /shared/logs.txt
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ SCRIPT_EXECUTION_FAILED: Python exited with code $EXIT_CODE"
  echo "   See /shared/logs.txt for details"
fi

# Capture structured output if present
if [ -f output.json ]; then
  mv output.json /shared/output.json
else
  sed -n '/OUTPUT_JSON_START/,/OUTPUT_JSON_END/p' /shared/logs.txt | sed '1d;$d' > /tmp/extracted.json
  if [ -s /tmp/extracted.json ]; then
    mv /tmp/extracted.json /shared/output.json
  fi
fi

if [ -d artifacts ]; then
  mv artifacts /shared/artifacts
fi

echo "{
  \"exitCode\": $EXIT_CODE,
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"
}" > /shared/metadata.json

echo "📁 Final shared contents:"
ls -R /shared || true

touch /shared/done
echo "✅ DONE"
exit $EXIT_CODE
                `,
              ],
            },
            // ========================
            // SIDECAR UPLOADER
            // ========================
            {
              name: "uploader",
              image: "amazon/aws-cli",
              env: [
                { name: "S3_BUCKET", value: process.env.AWS_S3_BUCKET },
                { name: "JOB_ID", value: jobName },
                { name: "AWS_REGION", value: process.env.AWS_REGION },
                { name: "AWS_ACCESS_KEY_ID", value: process.env.AWS_ACCESS_KEY_ID },
                { name: "AWS_SECRET_ACCESS_KEY", value: process.env.AWS_SECRET_ACCESS_KEY },
              ],
              volumeMounts: [{ name: "shared-volume", mountPath: "/shared" }],
              command: ["sh", "-c"],
              args: [
                `
echo "⏳ Waiting for completion signal..."
while [ ! -f /shared/done ]; do sleep 2; done

echo "⏳ Stabilizing files..."
sleep 5

echo "📂 Files to upload:"
ls -R /shared || true

rm -f /shared/done

echo "📤 Uploading to S3..."
if [ "$(ls -A /shared)" ]; then
  aws s3 cp /shared s3://$S3_BUCKET/outputs/executions/$JOB_ID/ --recursive
  echo "✅ Upload complete"
else
  echo "⚠️ No files found in /shared"
fi
                `,
              ],
            },
          ],
        },
      },
    },
  };

  const res = await batchV1.createNamespacedJob(ns, jobManifest);
  console.log(`✅ JOB CREATED: ${jobName}`);
  return res.body;
}

async function deleteJob(processId) {
  const ns = getNamespace();
  const jobName = sanitizeJobName(processId);
  await batchV1.deleteNamespacedJob(jobName, ns);
}

module.exports = { createJob, deleteJob };