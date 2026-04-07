def transform_data(data):
    print("🔄 Transforming data...")

    transformed = []

    for item in data:
        item["double"] = item["value"] * 2
        item["category"] = "even" if item["value"] % 2 == 0 else "odd"

        # nested-like enrichment
        item["meta"] = {
            "score": item["value"] * 1.5,
            "valid": item["value"] > 50
        }

        transformed.append(item)

    return transformed