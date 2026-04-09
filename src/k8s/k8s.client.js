/**
 * ============================================================
 * ☸️ KUBERNETES EXECUTION CLIENT (FINAL PRODUCTION)
 * ============================================================
 */

const k8s = require("@kubernetes/client-node");

/**
 * ============================================================
 * LOAD CONFIG
 * ============================================================
 */
const kc = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
  console.log("☸️ Using in-cluster Kubernetes config");
  kc.loadFromCluster();
} else {
  console.log("☸️ Using local kubeconfig");
  kc.loadFromDefault();
}

const batchV1 = kc.makeApiClient(k8s.BatchV1Api);

/**
 * ============================================================
 * NAMESPACE VALIDATION
 * ============================================================
 */
function getNamespace() {
  const ns = process.env.K8S_NAMESPACE;

  if (!ns || typeof ns !== "string" || !ns.trim()) {
    throw new Error("❌ K8S_NAMESPACE is missing or invalid");
  }

  return ns.trim();
}

/**
 * ============================================================
 * SAFE JOB NAME
 * ============================================================
 */
function sanitizeJobName(name) {
  return String(name)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 63);
}

/**
 * ============================================================
 * 🚀 CREATE JOB
 * ============================================================
 */
async function createJob(processId, scriptUrl, input = {}) {
  try {
    const ns = getNamespace();
    const jobName = sanitizeJobName(processId);

    console.log("☸️ FINAL NS USED:", ns);
    console.log("🚀 JOB NAME:", jobName);

    const jobManifest = {
      apiVersion: "batch/v1",
      kind: "Job",

      metadata: {
        name: jobName,
        labels: {
          app: "gsd-script-runner",
        },
      },

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

            /**
             * 🔐 OPTIONAL (ONLY IF PRIVATE DOCKER REPO)
             */
            // imagePullSecrets: [
            //   {
            //     name: "dockerhub-secret",
            //   },
            // ],

            containers: [
              {
                name: "runner",

                /**
                 * 🚀 YOUR OPTIMIZED IMAGE
                 */
                image: "monicab2026/gsd-python-runner:latest",

                /**
                 * 🔥 CRITICAL FIX
                 */
                imagePullPolicy: "Always",

                env: [
                  {
                    name: "INPUT_JSON",
                    value: JSON.stringify(input || {}),
                  },
                  {
                    name: "SCRIPT_URL",
                    value: scriptUrl,
                  },
                ],

                resources: {
                  requests: {
                    cpu: "100m",
                    memory: "128Mi",
                  },
                  limits: {
                    cpu: "500m",
                    memory: "512Mi",
                  },
                },

                command: ["sh", "-c"],

                args: [
                  `
set -e

echo "🚀 STARTING EXECUTION"

mkdir -p /app && cd /app

echo "📥 Downloading script..."
curl -f -o script.zip "$SCRIPT_URL"

echo "📦 Extracting..."
unzip script.zip

echo "$INPUT_JSON" > input.json

if [ -f requirements.txt ]; then
  echo "📦 Installing dependencies..."
  pip install -r requirements.txt
fi

echo "▶️ Running script..."

python main.py

echo "✅ DONE"
                  `,
                ],
              },
            ],
          },
        },
      },
    };

    /**
     * 🔥 SAFE API CALL
     */
    const response = await batchV1.createNamespacedJob({
      namespace: ns,
      body: jobManifest,
    });

    console.log("✅ JOB CREATED:", jobName);

    return response.body;
  } catch (err) {
    console.error("❌ CREATE JOB FAILED:");
    console.error(err.body || err.message);
    throw err;
  }
}

/**
 * ============================================================
 * 🧹 DELETE JOB
 * ============================================================
 */
async function deleteJob(processId) {
  try {
    const ns = getNamespace();
    const jobName = sanitizeJobName(processId);

    console.log("🧹 Deleting Job:", jobName);

    await batchV1.deleteNamespacedJob(
      jobName,
      ns,
      undefined,
      undefined,
      0,
      false,
      "Foreground"
    );

    console.log("✅ Job deleted:", jobName);
  } catch (err) {
    console.error("❌ deleteJob failed:");
    console.error(err.body || err.message);
  }
}

module.exports = {
  createJob,
  deleteJob,
};
