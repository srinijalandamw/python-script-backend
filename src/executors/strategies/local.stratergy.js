/**
 * LOCAL EXECUTION STRATEGY
 * ------------------------
 * Direct execution using Node environment (testing only)
 */

const { exec } = require("child_process");

class LocalStrategy {
    async run(job) {
        return new Promise((resolve, reject) => {

            const command = `python ${job.workspace}/main.py`;

            exec(command, (error, stdout, stderr) => {

                if (error) {
                    return reject(error);
                }

                resolve({
                    status: "success",
                    output: stdout,
                    error: stderr
                });
            });
        });
    }
}

module.exports = LocalStrategy;