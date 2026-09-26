"""Layer 1: data ingestion summaries. Team F6."""
import os
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_market(days: int = 90) -> pd.DataFrame:
    df = pd.read_csv(os.path.join(DATA_DIR, "market_time_series.csv"), parse_dates=["date"])
    return df.tail(days)


def load_ports(days: int = 90) -> pd.DataFrame:
    df = pd.read_csv(os.path.join(DATA_DIR, "port_operational_logs.csv"), parse_dates=["date"])
    return df.tail(days)


def market_summary() -> dict:
    df = load_market(365)
    last = df.iloc[-1]
    return {"rows": len(df),
            "last_date": str(last["date"]),
            "vlsfo": float(last["vlsfo_singapore_usd_mt"]),
            "baltic_p3a": float(last["baltic_p3a_usd_day"]),
            "aus_paradip_spot": float(last["aus_paradip_freight_usd_mt"])}
