"""
Naavai AI - Synthetic Data Generator for Prototype Testing
Generates realistic 5-year time series for Baltic routes, bunker prices,
vessel positions, and Indian port waiting queues.
Team F6.
"""
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
np.random.seed(42)

# Generate 5 years of daily dates
start_date = datetime(2021, 1, 1)
dates = [start_date + timedelta(days=i) for i in range(1825)]
n = len(dates)

# 1. Freight Market & Bunker Dataset
t = np.linspace(0, 5, n)
bunker_vlsfo = 550 + 120 * np.sin(2 * np.pi * t / 2.5) + np.cumsum(np.random.normal(0, 5, n))
baltic_p3a_cape = 18000 + 6000 * np.sin(2 * np.pi * t / 1.0) + np.cumsum(np.random.normal(0, 250, n))
aus_paradip_spot = 14.5 + 0.015 * (bunker_vlsfo - 500) + 0.0003 * (baltic_p3a_cape - 15000) + np.random.normal(0, 0.4, n)

df_market = pd.DataFrame({
    "date": dates,
    "vlsfo_singapore_usd_mt": np.round(bunker_vlsfo, 2),
    "baltic_p3a_usd_day": np.round(baltic_p3a_cape, 2),
    "ffa_30d_paper_usd_mt": np.round(aus_paradip_spot + np.random.normal(0, 0.3, n), 2),
    "aus_paradip_freight_usd_mt": np.round(aus_paradip_spot, 2),
    "usg_vizag_freight_usd_mt": np.round(aus_paradip_spot * 1.85 + np.random.normal(0, 0.6, n), 2),
    "indo_haldia_freight_usd_mt": np.round(aus_paradip_spot * 0.72 + np.random.normal(0, 0.3, n), 2),
})
df_market.to_csv(os.path.join(os.path.dirname(__file__), "data", "market_time_series.csv"), index=False)

# 2. Port Queues & Monsoon Dynamics
monsoon_seasonal = np.where(pd.to_datetime(dates).month.isin([6, 7, 8, 9]), 4.5, 0.0)
paradip_queue = np.clip(np.random.poisson(lam=5.0, size=n) + monsoon_seasonal + np.random.normal(0, 1.2, n), 1, 25)

df_ports = pd.DataFrame({
    "date": dates,
    "paradip_anchorage_queue_vessels": np.round(paradip_queue).astype(int),
    "vizag_anchorage_queue_vessels": np.round(np.clip(paradip_queue * 0.7 + np.random.normal(0, 1, n), 1, 18)).astype(int),
    "haldia_river_draft_meters": np.round(7.2 + 0.6 * np.sin(2 * np.pi * t * 12) + np.random.normal(0, 0.1, n), 2),
    "paradip_permissible_draft_meters": 14.50,
    "vizag_outer_permissible_draft_meters": 18.10,
    "gangavaram_permissible_draft_meters": 18.50,
})
df_ports.to_csv(os.path.join(os.path.dirname(__file__), "data", "port_operational_logs.csv"), index=False)

print("SUCCESS: Realistic test datasets generated in backend/data/")
