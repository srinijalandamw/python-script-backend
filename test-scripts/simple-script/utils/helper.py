import math

def calculate_complex_metrics(data):
    """Simulates a complex calculation engine."""
    score = data.get("test_score", 0)
    # Just a little math for the 'complex' vibe
    normalized_score = math.sqrt(score) * 10 
    
    status = "EXCELLENT" if score > 85 else "STABLE"
    return {
        "status": status,
        "processed_score": round(normalized_score, 2),
        "verified": True
    }