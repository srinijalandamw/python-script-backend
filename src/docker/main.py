import os
import json
import time

print("🚀 Container started")

execution_id = os.getenv("EXECUTION_ID")
print(f"📌 Execution ID: {execution_id}")

time.sleep(2)

# ✅ Create output
output = {
    "executionId": execution_id,
    "status": "SUCCESS",
    "outputs": [
        {
            "name": "result.json",
            "path": "/tmp/result.json",
            "type": "json"
        }
    ]
}

# ✅ PRINT OUTPUT (CRITICAL FIX)
print("📦 OUTPUT_JSON_START")
print(json.dumps(output))
print("📦 OUTPUT_JSON_END")

print("🎉 Execution completed")