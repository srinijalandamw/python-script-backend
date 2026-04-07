def aggregate(data):
    print("📊 Aggregating...")

    return {
        "total": len(data),
        "even": len([x for x in data if x["category"] == "even"]),
        "odd": len([x for x in data if x["category"] == "odd"]),
        "high_score": len([x for x in data if x["meta"]["score"] > 60])
    }