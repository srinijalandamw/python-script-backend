import json
import os

print("🚀 Script started")

# Read input
with open("/app/input.json", "r") as f:
    input_data = json.load(f)

print("📌 Input:", input_data)

# Create output
output_file = "/app/result.json"

with open(output_file, "w") as f:
    json.dump({
        "message": "Hello from script",
        "input": input_data
    }, f, indent=2)

# Output JSON for system
final_output = {
    "executionId": os.getenv("EXECUTION_ID"),
    "status": "SUCCESS",
    "outputs": [
        {
            "name": "result.json",
            "path": output_file,
            "type": "json"
        }
    ]
}

print("📦 OUTPUT_JSON_START")
print(json.dumps(final_output))
print("📦 OUTPUT_JSON_END")

print("🎉 Done")