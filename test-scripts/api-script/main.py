import requests
import json

# Load input
with open("input.json") as f:
    config = json.load(f)

limit = config.get("limit", 5)

# Call API
res = requests.get("https://jsonplaceholder.typicode.com/posts")
data = res.json()

# Process
filtered = data[:limit]

# Save JSON
with open("posts.json", "w") as f:
    json.dump(filtered, f, indent=2)

# Save CSV
import csv

with open("posts.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["id", "title"])
    writer.writeheader()

    for item in filtered:
        writer.writerow({
            "id": item["id"],
            "title": item["title"]
        })

print(f"✅ Fetched {limit} posts")