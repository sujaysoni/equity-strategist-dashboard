#!/usr/bin/env python3
"""
Equity Stock Analyzer - Enhanced with robust error handling

Analyzes CAD and USD stocks with proper checkpoint handling,
API rate limit management, and graceful error recovery.
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Ensure backend directory exists
os.makedirs("backend", exist_ok=True)

def load_checkpoint(checkpoint_path):
    """Load checkpoint data if it exists, otherwise return empty dict."""
    try:
        if os.path.exists(checkpoint_path):
            with open(checkpoint_path, "r") as f:
                checkpoint_data = json.load(f)
            logger.info(f"Loaded checkpoint from {checkpoint_path}")
            return checkpoint_data
        else:
            logger.warning(f"Checkpoint file not found: {checkpoint_path}. Starting fresh.")
            return {}
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error reading checkpoint {checkpoint_path}: {e}. Starting fresh.")
        return {}

def save_checkpoint(checkpoint_path, data):
    """Save checkpoint data, creating directory if needed."""
    try:
        os.makedirs(os.path.dirname(checkpoint_path) or ".", exist_ok=True)
        with open(checkpoint_path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        logger.info(f"Saved checkpoint to {checkpoint_path}")
    except IOError as e:
        logger.error(f"Failed to save checkpoint {checkpoint_path}: {e}")

def convert_pandas_types(obj):
    """Recursively convert pandas/numpy types to JSON-serializable types."""
    if isinstance(obj, dict):
        return {str(k): convert_pandas_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_pandas_types(item) for item in obj]
    elif isinstance(obj, (pd.Timestamp, pd.Timedelta)):
        return str(obj)
    elif hasattr(obj, 'item'):  # numpy types
        return obj.item()
    return obj

def fetch_ticker_data(ticker, max_retries=3, retry_delay=5):
    """Fetch ticker data with retry logic for rate limits."""
    import yfinance as yf
    
    for attempt in range(max_retries):
        try:
            # Add delay between requests to avoid rate limits
            if attempt > 0:
                logger.info(f"Retry attempt {attempt + 1}/{max_retries} for {ticker}")
                time.sleep(retry_delay * (attempt + 1))
            
            stock = yf.Ticker(ticker)
            # Add custom headers to avoid rate limiting
            stock._history_metadata = None
            
            # Fetch data with error handling
            hist = stock.history(period="1y")
            
            if hist.empty:
                logger.warning(f"No data for {ticker}")
                return None
            
            return {
                "ticker": ticker,
                "data": convert_pandas_types(hist.to_dict()),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error fetching {ticker} (attempt {attempt + 1}): {e}")
            if attempt == max_retries - 1:
                logger.error(f"Max retries exceeded for {ticker}, skipping...")
                return None
            continue
    
    return None

def analyze_stocks(region, checkpoint_path=None):
    """
    Main analysis function with proper error handling.
    
    Args:
        region: 'CAD' or 'USD'
        checkpoint_path: Path to checkpoint file
    """
    logger.info(f"Starting analysis for {region} stocks")
    
    # Load checkpoint if available
    checkpoint_data = {}
    if checkpoint_path:
        checkpoint_data = load_checkpoint(checkpoint_path)
    
    # Determine ticker cache file based on region
    if region == "CAD":
        ticker_cache = "backend/tsx_tickers_cache.json"
        results_file = "backend/results_cad.json"
    else:
        ticker_cache = "backend/nasdaq_tickers_cache.json"
        results_file = "backend/results_usd.json"
    
    # Load tickers
    try:
        if os.path.exists(ticker_cache):
            with open(ticker_cache, "r") as f:
                cache_data = json.load(f)
            # Extract tickers array from cache structure
            if isinstance(cache_data, dict) and "tickers" in cache_data:
                tickers_list = cache_data["tickers"]
            else:
                tickers_list = cache_data if isinstance(cache_data, list) else []
            
            logger.info(f"Loaded {len(tickers_list)} tickers from {ticker_cache}")
        else:
            logger.error(f"Ticker cache not found: {ticker_cache}")
            # Create empty results file to prevent workflow failure
            save_results(results_file, {"error": "No tickers found", "region": region})
            return
    except Exception as e:
        logger.error(f"Error loading ticker cache: {e}")
        save_results(results_file, {"error": str(e), "region": region})
        return
    
    # Analyze stocks
    results = []
    errors = []
    
    for i, ticker_entry in enumerate(tickers_list):
        try:
            # Handle both string tickers and dict entries {ticker, name, exchange, sector}
            if isinstance(ticker_entry, dict):
                ticker = ticker_entry.get("ticker", "")
            else:
                ticker = ticker_entry
            
            if not ticker:
                continue
            
            logger.info(f"Analyzing {ticker} ({i+1}/{len(tickers_list)})")
            
            # Check if we have recent data in checkpoint
            if ticker in checkpoint_data:
                cached_time = checkpoint_data[ticker].get("timestamp", "")
                # Use cached data if less than 1 hour old
                if cached_time:
                    cached_dt = datetime.fromisoformat(cached_time.replace("Z", "+00:00"))
                    age = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
                    if age < 1:
                        logger.info(f"Using cached data for {ticker} (age: {age:.1f}h)")
                        results.append(checkpoint_data[ticker])
                        continue
            
            # Fetch fresh data
            data = fetch_ticker_data(ticker)
            if data:
                results.append(data)
                # Update checkpoint
                checkpoint_data[ticker] = data
            else:
                errors.append({"ticker": ticker, "error": "Failed to fetch data"})
                
        except Exception as e:
            logger.error(f"Unexpected error analyzing {ticker}: {e}")
            errors.append({"ticker": ticker, "error": str(e)})
            continue
    
    # Save results
    save_results(results_file, {
        "region": region,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "results": results,
        "errors": errors,
        "summary": {
            "total": len(tickers_list),
            "analyzed": len(results),
            "failed": len(errors)
        }
    })
    
    # Save checkpoint
    if checkpoint_path:
        save_checkpoint(checkpoint_path, checkpoint_data)
    
    logger.info(f"Analysis complete. Results: {len(results)} analyzed, {len(errors)} failed")

def save_results(results_path, data):
    """Save analysis results to file."""
    try:
        os.makedirs(os.path.dirname(results_path) or ".", exist_ok=True)
        with open(results_path, "w") as f:
            json.dump(convert_pandas_types(data), f, indent=2, default=str)
        logger.info(f"Results saved to {results_path}")
    except Exception as e:
        logger.error(f"Failed to save results: {e}")
        # Don't raise - let workflow continue

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Analyze equity stocks")
    parser.add_argument("--region", required=True, choices=["CAD", "USD"], help="Region to analyze")
    parser.add_argument("--checkpoint", help="Path to checkpoint file")
    args = parser.parse_args()
    
    # Set default checkpoint path if not provided
    checkpoint_path = args.checkpoint or f"backend/_checkpoint_{args.region}.json"
    
    try:
        analyze_stocks(args.region, checkpoint_path)
    except Exception as e:
        logger.error(f"Fatal error in analysis: {e}")
        # Exit with error code but ensure we don't crash the entire workflow
        sys.exit(1)
