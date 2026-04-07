import random
import time

def fetch_data():
    print("📡 Simulating API call...")

    time.sleep(2)

    return [
        {"id": i, "value": random.randint(1, 100)}
        for i in range(10)
    ]