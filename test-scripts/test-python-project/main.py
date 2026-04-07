from services.api_service import fetch_data
from pipelines.transformer import transform_data
from pipelines.aggregator import aggregate
from utils.logger import log

def main():
    log("🚀 Script started")

    data = fetch_data()
    log(f"📡 Fetched {len(data)} records")

    transformed = transform_data(data)
    log("🔄 Transformation complete")

    result = aggregate(transformed)

    log("📊 Final result computed")
    print(result)

    log("✅ Script finished successfully")

if __name__ == "__main__":
    main()