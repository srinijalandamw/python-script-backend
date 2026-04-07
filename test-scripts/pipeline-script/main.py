iimport sys
import os

sys.path.append(os.getcwd())  # 🔥 FIX

from utils import transform

# Load input
with open("input.json") as f:
    config = json.load(f)

count = config.get("count", 3)

# Generate data
data = [{"id": i} for i in range(1, count + 1)]

# Transform
result = transform(data)

# Save JSON
with open("data.json", "w") as f:
    json.dump(result, f, indent=2)

# Create ZIP bundle
with zipfile.ZipFile("bundle.zip", "w") as z:
    z.write("data.json")

print("✅ Pipeline completed")