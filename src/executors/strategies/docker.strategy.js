/**
 * ============================================================
 * DOCKER STRATEGY (PRODUCTION EXECUTION LAYER)
 * This is just to run scriots inside docker
 * ------------------------------------------------------------
 * This is where actual Python execution happens.
 * ============================================================
 */

const { spawn } = require("child_process");

class DockerStrategy {
  constructor(io, executionModel) {
    this.io = io; // socket instance
    this.Execution = executionModel;
  }

  async run({ workspace, executionId }) {
    const socketRoom = executionId;

    const docker = spawn("docker", [
      "run",
      "--rm",
      "-v",
      `${workspace}:/app/script`,
      "python-runner-base",
      "python",
      "-u",
      "/app/script/main.py",
    ]);

    // ============================================================
    // TIMEOUT HANDLING (5 min)
    // ============================================================
    const timeout = setTimeout(() => {
      docker.kill("SIGKILL");
    }, 5 * 60 * 1000);

    // ============================================================
    // STDOUT STREAM
    // ============================================================
    docker.stdout.on("data", async (data) => {
      const log = data.toString();

      // ⚠️ Uncomment when DB logging needed
      /*
      await this.Execution.updateOne(
        { _id: executionId },
        { $push: { logs: log } }
      );
      */

      this.io.to(socketRoom).emit("executionLog", log);
    });

    // ============================================================
    // STDERR STREAM
    // ============================================================
    docker.stderr.on("data", async (data) => {
      const log = data.toString();

      this.io.to(socketRoom).emit("executionLog", log);
    });

    // ============================================================
    // ERROR HANDLING
    // ============================================================
    docker.on("error", async (err) => {
      clearTimeout(timeout);

      await this.Execution.findByIdAndUpdate(executionId, {
        status: "FAILED",
        finishedAt: new Date(),
      });

      this.io.to(socketRoom).emit("executionFinished", {
        executionId,
        status: "FAILED",
      });
    });

    // ============================================================
    // CLOSE HANDLER (FINAL RESULT)
    // ============================================================
    return new Promise((resolve) => {
      docker.on("close", async (code) => {
        clearTimeout(timeout);

        const status = code === 0 ? "SUCCESS" : "FAILED";

        await this.Execution.findByIdAndUpdate(executionId, {
          status,
          finishedAt: new Date(),
        });

        this.io.to(socketRoom).emit("executionFinished", {
          executionId,
          status,
        });

        resolve({
          executionId,
          status,
          exitCode: code,
        });
      });
    });
  }
}

module.exports = DockerStrategy;