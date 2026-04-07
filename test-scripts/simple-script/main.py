import json
import os
import sys
from utils.helper import calculate_complex_metrics

def main():
    print("--- GSD PYTHON RUNNER: STARTING ---")
    
    try:
        # Load the configuration
        with open('input.json', 'r') as f:
            config = json.load(f)
            
        print(f"📦 Loading Script for: {config.get('user', 'Unknown')}")
        
        # Execute complex logic from utils
        results = calculate_complex_metrics(config)
        
        print(f"✅ EXECUTION SUCCESS: {results}")
        
    except FileNotFoundError:
        print("❌ ERROR: input.json is missing!")
        sys.exit(1)
    except Exception as e:
        print(f"🔥 CRITICAL ERROR: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()