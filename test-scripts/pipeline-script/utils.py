def transform(data):
    return [{"id": x["id"], "value": x["id"] * 10} for x in data]