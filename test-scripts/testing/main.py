import json
import os
from services.api_service import fetch_data
from utils.processor import process_data

print("🚀 Script started")

# =========================
# READ INPUT
# =========================
input_path = "/app/input.json"

if not os.path.exists(input_path):
    raise Exception("❌ input.json not found")

with open(input_path, "r") as f:
    input_data = json.load(f)

company_id = input_data.get("companyId")
start_date = input_data.get("startDate")
end_date = input_data.get("endDate")

print(f"📥 Input received: {input_data}")

# =========================
# FETCH DATA FROM API
# =========================
data = fetch_data(company_id, start_date, end_date)

# =========================
# PROCESS DATA
# =========================
processed = process_data(data)

# =========================
# OUTPUT JSON (VERY IMPORTANT FORMAT)
# =========================
output = {
    "outputs": [
        {
            "type": "json",
            "data": processed
        }
    ]
}

print("OUTPUT_JSON_START")
print(json.dumps(output))
print("OUTPUT_JSON_END")

print("✅ Script completed")