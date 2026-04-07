import csv
import time

print("Starting CSV generation...")

time.sleep(2)

data = [
    ["id", "name", "price"],
    [1, "House A", 100000],
    [2, "House B", 150000],
    [3, "House C", 200000],
]

with open("output.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerows(data)

print("CSV file generated: output.csv")