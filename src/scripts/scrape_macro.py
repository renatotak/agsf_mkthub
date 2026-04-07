# ============================================================
# DEPRECATED 2026-04-07 (Phase 19B)
#
# This Python script is superseded by the TypeScript scraper at
# /api/cron/sync-faostat, which runs through the new
# src/lib/scraper-runner.ts wrapper and writes to scraper_runs /
# scraper_knowledge for the auto-correction protocol.
#
# Do NOT run this against production — it would race the TS scraper
# on the same upsert key (source_id, commodity, region, indicator,
# period) in macro_statistics.
#
# Kept for reference until USDA WASDE PDF parsing is ported to TS in
# a later Phase 19 slice.
# ============================================================

import os
import requests
import re
import datetime
from typing import List, Dict, Any
from supabase import create_client, Client

# USDA WASDE Config
WASDE_BASE_URL = "https://www.usda.gov/oce/commodity/wasde/wasde{}.txt"

# Supabase Config
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Local .env.macro fallback
if not SUPABASE_URL or not SUPABASE_KEY:
    env_path = os.path.join(os.path.dirname(__file__), ".env.macro")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line:
                    k, v = line.strip().split("=", 1)
                    if k == "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL = v
                    if k == "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY = v

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase environment variables.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_wasde_url():
    # Attempt latest found by browser (March 2026)
    # wasde0326.txt
    now = datetime.datetime.now()
    # Reports usually out around 9-12th of month
    # If today < 10th, try previous month
    if now.day < 12:
        report_date = now - datetime.timedelta(days=20)
    else:
        report_date = now
    
    mmyy = report_date.strftime("%m%y")
    return WASDE_BASE_URL.format(mmyy), report_date

def parse_wasde_text(text: str, commodity: str):
    results = []
    # Find table section for commodity
    # Example: "World Soybean Supply and Use"
    section_patterns = {
        "soybeans": r"World Soybean Supply and Use",
        "corn": r"World Corn Supply and Use"
    }
    
    pattern = section_patterns.get(commodity)
    if not pattern: return []
    
    # Extract the block
    parts = re.split(pattern, text)
    if len(parts) < 2: return []
    
    block = parts[1][:5000] # Take a good chunk
    
    # Process Brazil row
    # Example: Brazil             :    155.00 :    102.00 : ...
    # Col indices in WASDE (approximate)
    # Output: Production, Exports, Ending Stocks
    
    rows = block.split('\n')
    
    def extract_row_data(row_name: str):
        for line in rows:
            if row_name.lower() in line.lower():
                # Extract numbers
                nums = re.findall(r"[\d]+[\.][\d]+", line)
                if not nums:
                    # Try integers if no float found
                    nums = re.findall(r"\d+", line)
                return [float(n) for n in nums]
        return []

    # Map to metrics
    # WASDE Table Header for World Grain:
    # Output | Total | Total | Domestic | Domestic | Ending
    #  Prod  | Import| Export|  Feed    |  Total   | Stocks
    
    # For Soybeans (Table 28):
    # Output: Production, Total Supply, Exports, Crush, Domestic Total, Ending Stocks
    
    brazil_data = extract_row_data("Brazil")
    world_data = extract_row_data("Total World")
    
    # Heuristic for Soybeans (Million Metric Tons)
    if commodity == "soybeans":
        # Production is usually 1st
        # Exports is usually 3rd
        # Stocks is usually 6th
        if len(brazil_data) >= 6:
            results.append({
                "region": "Brazil",
                "metrics": {
                    "production": brazil_data[0],
                    "exports": brazil_data[2],
                    "ending_stocks": brazil_data[5]
                }
            })
        if len(world_data) >= 6:
            results.append({
                "region": "World",
                "metrics": {
                    "production": world_data[0],
                    "exports": world_data[2],
                    "ending_stocks": world_data[5]
                }
            })
            
    # For Corn (Coarse Grains Table 12/13)
    elif commodity == "corn":
        # Usually: Production, Imports, Exports, Feed, Total Dom, Stocks
        if len(brazil_data) >= 6:
            results.append({
                "region": "Brazil",
                "metrics": {
                    "production": brazil_data[0],
                    "exports": brazil_data[2],
                    "ending_stocks": brazil_data[5]
                }
            })
        if len(world_data) >= 6:
            results.append({
                "region": "World",
                "metrics": {
                    "production": world_data[0],
                    "exports": world_data[2],
                    "ending_stocks": world_data[5]
                }
            })

    return results

def sync_macro():
    url, report_date = get_wasde_url()
    print(f"Fetching WASDE from {url}...")
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        text = response.text
    except Exception as e:
        print(f"Error fetching WASDE: {e}")
        return

    report_ref_date = report_date.replace(day=1).strftime("%Y-%m-%d")
    period = f"{report_date.year-1}/{str(report_date.year)[2:]}" # e.g. 2025/26

    for comm in ["soybeans", "corn"]:
        data = parse_wasde_text(text, comm)
        for entry in data:
            region = entry["region"]
            for metric, val in entry["metrics"].items():
                payload = {
                    "source_id": "usda_wasde",
                    "category": "offer_demand",
                    "commodity": comm,
                    "region": region,
                    "indicator": metric,
                    "value": val,
                    "unit": "million_metric_tons",
                    "period": period,
                    "reference_date": report_ref_date,
                    "metadata": {"version": "USDA WASDE Latest"}
                }
                
                # Upsert
                try:
                    res = supabase.table("macro_statistics").upsert(
                        payload, 
                        on_conflict="source_id,commodity,region,indicator,period"
                    ).execute()
                    print(f"Upserted: {region} {comm} {metric} = {val}")
                except Exception as e:
                    print(f"Error upserting {region} {comm}: {e}")

if __name__ == "__main__":
    sync_macro()
