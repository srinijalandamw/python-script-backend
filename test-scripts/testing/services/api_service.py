import requests

def fetch_data(company_id, start_date, end_date):
    print("🌐 Calling external API...")

    url = "https://jsonplaceholder.typicode.com/posts"

    response = requests.get(url)

    if response.status_code != 200:
        raise Exception("❌ API call failed")

    data = response.json()

    # simulate filtering
    filtered = [
        d for d in data
        if d["id"] <= 10
    ]

    print(f"📊 Fetched {len(filtered)} records")

    return filtered