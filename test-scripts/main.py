import os

print("📂 Current Dir:", os.getcwd())
print("📂 Files:", os.listdir())

with open("input.json") as f:
    data = f.read()

print("✅ Input loaded:", data)