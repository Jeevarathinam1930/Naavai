"""Layer 3b: VECM macro anchor (statsmodels) with FFA fallback. Team F6."""

def vecm_anchor(csv_path: str = "backend/data/market_time_series.csv") -> dict:
    try:
        import pandas as pd
        from statsmodels.tsa.vector_error_correction_model import VECM
        df = pd.read_csv(csv_path)
        y = df[["aus_paradip_freight_usd_mt", "vlsfo_singapore_usd_mt", "baltic_p3a_usd_day"]].dropna().tail(400)
        model = VECM(y, k_ar_diff=1, coint_rank=1, deterministic="co")
        res = model.fit()
        anchor = float(res.predict(steps=1)[0][0])
        return {"mode": "VECM", "anchor_30d_usd_mt": round(anchor, 2)}
    except Exception as e:
        try:
            import pandas as pd
            df = pd.read_csv(csv_path)
            ffa = float(df["ffa_30d_paper_usd_mt"].iloc[-1])
            return {"mode": f"FFA-fallback ({type(e).__name__})", "anchor_30d_usd_mt": round(ffa, 2)}
        except Exception as e2:
            return {"mode": f"unavailable ({e2})", "anchor_30d_usd_mt": 20.0}
