/**
 * ☸️ KUBERNETES CLIENT (FINAL PRODUCTION)
 *THIS IS USED TO CREATE KUBERNETES JOBS
 * 🔥 KEY FEATURES:
 * - Single reusable base image
 * - Dynamic script execution
 * - Safe curl (fails if bad zip)
 * - Proper working directory (/app)
 * - Input injection via ENV
 */

const k8s = require("@kubernetes/client-node");

const kc = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const batchV1 = kc.makeApiClient(k8s.BatchV1Api);

/**
 * 🚀 CREATE JOB - RESPOINSIBLE FOR CREATING THE JOB IN THE KUBERNETES 
 */
async function createJob(executionId, scriptPath, input = {}) {
  const namespace = process.env.K8S_NAMESPACE || "default";

  const jobName = `job-${executionId}`;

  console.log("☸️ Creating Job:", jobName);

  const jobManifest = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: jobName },

    spec: {
      template: {
        spec: {
          restartPolicy: "Never",

          containers: [
            {
              name: "runner",
              image: "python:3.10",
              imagePullPolicy: "IfNotPresent",

              env: [
                {
                  name: "INPUT_JSON",
                  value: JSON.stringify(input || {}),
                },
              ],

              command: ["sh", "-c"],

              args: [
                `
set -e  # 🔥 FAIL FAST

echo "🚀 Container started"

mkdir -p /app
cd /app

echo "📦 Installing system deps..."
apt update && apt install -y unzip curl

echo "📥 Downloading script..."
curl -f -o script.zip http://host.minikube.internal:3000/scripts/${scriptPath}

echo "📂 Unzipping..."
unzip script.zip

echo "🧾 Creating input.json..."
echo "$INPUT_JSON" > /app/input.json

echo "📦 Installing Python deps..."
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

echo "▶️ Running script..."
python main.py

echo "📤 Execution completed"
                `,
              ],
            },
          ],
        },
      },

      backoffLimit: 0,
    },
  };

  return batchV1.createNamespacedJob({
    namespace,
    body: jobManifest,
  });
}

module.exports = { createJob };