def process_data(data):
    print("⚙️ Processing data...")

    result = []

    for item in data:
        result.append({
            "id": item["id"],
            "title": item["title"].upper()
        })

    return result