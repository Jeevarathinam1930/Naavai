import os
import numpy as np
import pandas as pd


class FreightRateForecaster:
    ROUTE_TARGETS = {
        "Australia-EastCoastIndia": "aus_paradip_freight_usd_mt",
        "USGulf-EastCoastIndia": "usg_vizag_freight_usd_mt",
        "Indonesia-EastCoastIndia": "indo_haldia_freight_usd_mt",
    }

    FEATURE_NAMES = [
        "vlsfo_singapore_usd_mt",
        "baltic_p3a_usd_day",
        "bunker_ma7",
        "baltic_ma30",
        "ffa_30d_paper_usd_mt",
    ]

    def __init__(self):
        self.models = {}  # (route, quantile_or_horizon): model
        self.latest_stats = {}

    @classmethod
    def resolve_route_key(cls, origin: str, dest: str) -> str:
        orig = (origin or "").lower()
        if any(k in orig for k in ["us", "newport", "mobile", "hampton", "houston"]):
            return "USGulf-EastCoastIndia"
        elif any(k in orig for k in ["indo", "samarinda", "muara", "balikpapan", "taboneo"]):
            return "Indonesia-EastCoastIndia"
        else:
            return "Australia-EastCoastIndia"

    def train_models(self, csv_path: str = "backend/data/market_time_series.csv"):
        import lightgbm as lgb

        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"Market dataset not found at {csv_path}")

        df = pd.read_csv(csv_path)

        # Feature Engineering: True rolling moving averages
        df["bunker_ma7"] = df["vlsfo_singapore_usd_mt"].rolling(7).mean()
        df["baltic_ma30"] = df["baltic_p3a_usd_day"].rolling(30).mean()

        # Save latest 6-day bunker sum and 29-day baltic sum for true online rolling inference
        valid_bunker = df["vlsfo_singapore_usd_mt"].dropna()
        valid_baltic = df["baltic_p3a_usd_day"].dropna()
        self.latest_stats = {
            "bunker_last_6": valid_bunker.tail(6).sum(),
            "baltic_last_29": valid_baltic.tail(29).sum(),
            "last_ffa": float(df["ffa_30d_paper_usd_mt"].dropna().iloc[-1]),
        }

        # Train models for each trade route
        for route_key, target_col in self.ROUTE_TARGETS.items():
            if target_col not in df.columns:
                continue

            sub_df = df.dropna(subset=self.FEATURE_NAMES + [target_col]).copy()
            X = sub_df[self.FEATURE_NAMES]
            y = sub_df[target_col]

            # 1. Primary 30d Quantile Regressors: P10, P50, P90
            for alpha, q_name in [(0.10, "P10"), (0.50, "P50"), (0.90, "P90")]:
                model = lgb.LGBMRegressor(
                    objective="quantile",
                    alpha=alpha,
                    n_estimators=120,
                    learning_rate=0.04,
                    random_state=42,
                    verbosity=-1,
                )
                model.fit(X, y)
                self.models[(route_key, q_name)] = model

            # 2. Multi-Horizon Direct Regressors: 7d, 14d, 60d
            for horizon_days in [7, 14, 60]:
                y_horizon = sub_df[target_col].shift(-horizon_days)
                valid_idx = y_horizon.notna()
                if valid_idx.sum() > 100:
                    h_model = lgb.LGBMRegressor(
                        objective="regression",
                        n_estimators=100,
                        learning_rate=0.05,
                        random_state=42,
                        verbosity=-1,
                    )
                    h_model.fit(X[valid_idx], y_horizon[valid_idx])
                    self.models[(route_key, f"{horizon_days}d")] = h_model

    def build_feature_vector(self, current_inputs: dict) -> pd.DataFrame:
        vlsfo = float(current_inputs.get("vlsfo_price", 620.0))
        baltic = float(current_inputs.get("baltic_p3a", 19500.0))
        ffa = float(current_inputs.get("ffa_rate", 21.0))

        # Dynamically compute rolling values incorporating the incoming user quote
        b_sum6 = self.latest_stats.get("bunker_last_6", vlsfo * 6)
        bunker_ma7 = (b_sum6 + vlsfo) / 7.0

        p_sum29 = self.latest_stats.get("baltic_last_29", baltic * 29)
        baltic_ma30 = (p_sum29 + baltic) / 30.0

        return pd.DataFrame([[vlsfo, baltic, bunker_ma7, baltic_ma30, ffa]], columns=self.FEATURE_NAMES)

    def predict_rates(self, current_inputs: dict, origin: str = "Gladstone", dest: str = "Paradip") -> dict:
        route_key = self.resolve_route_key(origin, dest)
        features = self.build_feature_vector(current_inputs)

        # Fallback to default route if specific route not trained
        p10_model = self.models.get((route_key, "P10")) or self.models.get(("Australia-EastCoastIndia", "P10"))
        p50_model = self.models.get((route_key, "P50")) or self.models.get(("Australia-EastCoastIndia", "P50"))
        p90_model = self.models.get((route_key, "P90")) or self.models.get(("Australia-EastCoastIndia", "P90"))

        if p50_model is None:
            # Safe analytical baseline if uninitialized
            base = 20.0 if "aus" in route_key.lower() else (36.0 if "usg" in route_key.lower() else 14.5)
            return {
                "route_key": route_key,
                "P10_optimistic_usd_mt": round(base * 0.92, 2),
                "P50_expected_usd_mt": round(base, 2),
                "P90_risk_ceiling_usd_mt": round(base * 1.12, 2),
                "features_vector": features,
                "horizons": {
                    "7d": {"P50": round(base * 0.99, 2), "P10": round(base * 0.91, 2), "P90": round(base * 1.09, 2)},
                    "14d": {"P50": round(base * 0.995, 2), "P10": round(base * 0.90, 2), "P90": round(base * 1.10, 2)},
                    "30d": {"P50": round(base, 2), "P10": round(base * 0.92, 2), "P90": round(base * 1.12, 2)},
                    "60d": {"P50": round(base * 1.015, 2), "P10": round(base * 0.88, 2), "P90": round(base * 1.15, 2)},
                },
            }

        p10_val = round(float(p10_model.predict(features)[0]), 2)
        p50_val = round(float(p50_model.predict(features)[0]), 2)
        p90_val = round(float(p90_model.predict(features)[0]), 2)

        # Multi-horizon projections
        horizons = {}
        for h in [7, 14, 60]:
            h_model = self.models.get((route_key, f"{h}d"))
            if h_model:
                h_p50 = round(float(h_model.predict(features)[0]), 2)
            else:
                h_p50 = round(p50_val * (1.0 + (0.015 if h == 60 else -0.01)), 2)
            # Spread widens with time uncertainty
            h_spread = (p90_val - p10_val) * (1.0 + (0.008 * h))
            horizons[f"{h}d"] = {
                "P50": h_p50,
                "P10": round(h_p50 - h_spread * 0.45, 2),
                "P90": round(h_p50 + h_spread * 0.55, 2),
            }

        horizons["30d"] = {"P50": p50_val, "P10": p10_val, "P90": p90_val}

        return {
            "route_key": route_key,
            "P10_optimistic_usd_mt": p10_val,
            "P50_expected_usd_mt": p50_val,
            "P90_risk_ceiling_usd_mt": p90_val,
            "features_vector": features,
            "horizons": horizons,
        }

    def get_p50_model(self, route_key: str):
        return self.models.get((route_key, "P50")) or self.models.get(("Australia-EastCoastIndia", "P50"))

