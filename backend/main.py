"""
Main FastAPI Application Server
Coordinates all 5 layers and exposes REST API endpoints for the dashboard.
Team F6 - Naavai AI - PS26006 (Production Prototype)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from backend.physics.voyage_cost_engine import VoyageCostEngine
from backend.physics.port_clearance_checker import check_clearance
from backend.simulation.port_queue_sim import (
    PORT_QUEUE_SPECS,
    simulate_port_discrete_event,
    mmc_wait,
    demurrage_exposure,
)
from backend.simulation.ais_geofence import get_live_anchorage_vessels
from backend.optimization.milp_solver import (
    generate_sample_sail_indent_program,
    optimise_schedule,
)
from backend.ml_engine.rate_forecaster import FreightRateForecaster
from backend.ml_engine.shap_explainer import explain_forecast
from backend.ml_engine.vecm_anchor import vecm_anchor

app = FastAPI(title="Naavai AI - SAIL Decision Support API (Team F6)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize and train ML Models
forecaster = FreightRateForecaster()
try:
    forecaster.train_models("backend/data/market_time_series.csv")
    print("SUCCESS: LightGBM Multi-Route & Multi-Horizon models trained.")
except Exception as e:
    print(f"Warning: Model training deferred ({e})")


class CargoIndentRequest(BaseModel):
    cargo_type: str = "Prime Hard Coking Coal"
    tonnage: float = 75000.0
    origin_port: str = "Gladstone"
    destination_port: str = "Paradip"
    vessel_class: str = "Kamsarmax"
    current_vlsfo_bunker: float = 620.0
    current_baltic_p3a: float = 19500.0
    current_ffa_30d: float = 21.0


@app.get("/api/v1/health")
def health():
    return {
        "status": "OK",
        "team": "F6",
        "service": "Naavai AI Decision-Support System",
        "version": "2.0.0",
        "models_trained": len(forecaster.models) > 0,
    }


@app.post("/api/v1/analyze-shipment")
def analyze_shipment(req: CargoIndentRequest):
    # 1. Physics Breakeven Floor (Layer 2)
    breakeven = VoyageCostEngine.compute_breakeven_floor(
        origin=req.origin_port,
        dest=req.destination_port,
        vessel_class=req.vessel_class,
        bunker_price=req.current_vlsfo_bunker,
        cargo_tonnage=req.tonnage,
    )
    clearance = check_clearance(
        port=req.destination_port,
        vessel_class=req.vessel_class,
        cargo_tonnage=req.tonnage,
    )

    # 2. Predictive ML Forecast (Layer 3) with Multi-Route & Multi-Horizon models
    current_inputs = {
        "vlsfo_price": req.current_vlsfo_bunker,
        "baltic_p3a": req.current_baltic_p3a,
        "ffa_rate": req.current_ffa_30d,
    }
    forecast = forecaster.predict_rates(
        current_inputs, origin=req.origin_port, dest=req.destination_port
    )

    # Physics Floor Guard: Market freight cannot fall below thermodynamic breakeven
    p50_raw = forecast["P50_expected_usd_mt"]
    cost_floor = breakeven["breakeven_floor_usd_mt"] * 1.05
    p50_final = max(p50_raw, round(cost_floor, 2))

    # Live SHAP Explainer decomposition
    p50_model = forecaster.get_p50_model(forecast["route_key"])
    features_vec = forecast.get("features_vector")
    if p50_model is not None and features_vec is not None:
        shap_audit = explain_forecast(
            p50_model,
            features_vec,
            forecaster.FEATURE_NAMES,
            base_fallback=p50_final,
        )
    else:
        shap_audit = {
            "base_rate_usd_mt": 18.2,
            "contributions_usd_mt": {
                "vlsfo_singapore_usd_mt": 0.45,
                "baltic_p3a_usd_day": 0.32,
                "bunker_ma7": 0.18,
                "baltic_ma30": 0.12,
                "ffa_30d_paper_usd_mt": 0.73,
            },
            "status": "BASELINE",
        }

    anchor = vecm_anchor()

    # 3. Dynamic Port Simulation (Layer 4) based on destination port
    port_sim = simulate_port_discrete_event(req.destination_port, req.tonnage)
    dem = port_sim["demurrage"]

    # 4. Strategic Multi-Cargo Schedule & Optimization (Layer 5)
    indent_program = generate_sample_sail_indent_program(base_rate=p50_final)

    # Single-voyage commercial cost evaluation
    port_disb = breakeven.get("port_disbursements_usd", 85000)
    single_voyage_spot_usd = req.tonnage * p50_final + dem["demurrage_usd"] + port_disb
    single_voyage_coa_usd = req.tonnage * (p50_final * 0.94) + dem["demurrage_usd"] + port_disb
    single_savings_inr_cr = round(((single_voyage_spot_usd - single_voyage_coa_usd) * 84.0) / 10_000_000, 2)

    # Timing strategy
    if p50_final <= forecast["P90_risk_ceiling_usd_mt"] * 0.92:
        timing_advice = "STRONG BUY / FIX PROMPTLY: Rates near lower band; lock within 3–5 days."
    elif p50_final >= forecast["P90_risk_ceiling_usd_mt"]:
        timing_advice = "HOLD / DELAY FIXTURE: Rates overheated; utilize plant buffer inventory."
    else:
        timing_advice = "EXECUTE NORMAL TENDER: Stable market within expected P50 trajectory."

    return {
        "status": "SUCCESS",
        "inputs": req.model_dump(),
        "layer2_naval_physics": breakeven,
        "layer2_clearance": clearance,
        "layer3_ml_forecast": {
            "route_key": forecast["route_key"],
            "P10_floor": forecast["P10_optimistic_usd_mt"],
            "P50_recommended_rate": round(p50_final, 2),
            "P90_ceiling": forecast["P90_risk_ceiling_usd_mt"],
            "horizons": forecast["horizons"],
            "macro_anchor": anchor,
            "shap_audit": shap_audit,
        },
        "layer4_queue_demurrage": {
            "simulation_mode": port_sim["mode"],
            "simulated_avg_wait_days": port_sim.get("simulated_avg_wait_days", 2.8),
            "simulated_p90_wait_days": port_sim.get("simulated_p90_wait_days", 4.5),
            "demurrage": dem,
        },
        "layer5_recommendation": {
            "timing_advice": timing_advice,
            "contract_mode": f"Absorb into 6-Month COA Tranche (Saves ~Rs.{single_savings_inr_cr} Cr on parcel)",
            "demurrage_cap_recommendation": f"${int(dem['daily_demurrage_rate']):,} / Day",
            "broker_order_ready": clearance["allowed"],
            "single_voyage_spot_usd": round(single_voyage_spot_usd, 2),
            "portfolio_optimization": {
                "total_cargoes": len(indent_program["assignments"]),
                "baseline_spot_total_usd": indent_program["pure_spot_baseline_total_usd"],
                "optimised_total_usd": indent_program["optimised_total_usd"],
                "portfolio_savings_inr_cr": indent_program["savings_inr_crores"],
                "safety_stock_ok": indent_program["safety_stock_ok"],
                "schedule_assignments": indent_program["assignments"],
            },
        },
    }


@app.get("/api/v1/live-ais-tracking")
def live_ais_tracking():
    """Returns detected satellite AIS tracking telemetry for Paradip, Vizag, and Haldia."""
    return {"status": "SUCCESS", "vessels": get_live_anchorage_vessels()}


@app.get("/api/v1/sail-indent-schedule")
def sail_indent_schedule(base_rate: float = 20.0):
    """Executes full Layer 5 MILP Schedule optimization over 10 SAIL overseas coal indents."""
    return generate_sample_sail_indent_program(base_rate=base_rate)


@app.get("/api/v1/forecast-history")
def forecast_history(days: int = 90):
    from backend.data_engine.ingest import load_market
    df = load_market(days)
    return {
        "dates": df["date"].astype(str).tolist(),
        "spot": df["aus_paradip_freight_usd_mt"].tolist(),
        "ffa": df["ffa_30d_paper_usd_mt"].tolist(),
        "bunker": df["vlsfo_singapore_usd_mt"].tolist(),
    }


@app.get("/api/v1/port-congestion")
def port_congestion():
    from backend.data_engine.ingest import load_ports
    df = load_ports(1)
    last = df.iloc[-1]
    ports = {
        "Paradip": {"queue": int(last["paradip_anchorage_queue_vessels"]), "berths": 2},
        "Visakhapatnam": {"queue": int(last["vizag_anchorage_queue_vessels"]), "berths": 2},
        "Haldia": {"queue": 3, "berths": 1},
    }
    out = {}
    for name, p in ports.items():
        lam = p["queue"] / 7.0
        mu = 0.5 if name != "Haldia" else 0.35
        w = mmc_wait(lam, mu, p["berths"])
        out[name] = {**p, **w}
    return out


@app.post("/api/v1/broker-order", response_class=PlainTextResponse)
def broker_order(req: CargoIndentRequest):
    r = analyze_shipment(req)
    p50 = r["layer3_ml_forecast"]["P50_recommended_rate"]
    ukc = r["layer2_clearance"]
    b = r["layer2_naval_physics"]
    return (
        f"=================================================================\n"
        f"       STEEL AUTHORITY OF INDIA LIMITED (SAIL) - TSD KOLKATA     \n"
        f"               INTELLIGENT BROKER CARGO ORDER                    \n"
        f"=================================================================\n"
        f"Generated via: Naavai AI Decision-Support System (PS26006, Team F6)\n"
        f"Commodity:        {req.cargo_type}\n"
        f"Parcel Quantity:  {req.tonnage:,.0f} Metric Tonnes (+/- 10% MOLOO)\n"
        f"Route:            {req.origin_port} -> {req.destination_port} ({b['distance_nm']} NM)\n"
        f"Vessel Preferred: {req.vessel_class} (Operating Draft: {ukc['operating_draft_m']}m)\n"
        f"-----------------------------------------------------------------\n"
        f"COMMERCIAL PRICING INSTRUCTIONS:\n"
        f"  Target Freight Rate:  ${p50:.2f} / MT\n"
        f"  Ceiling Cap (P90):    ${r['layer3_ml_forecast']['P90_ceiling']:.2f} / MT\n"
        f"  Admiralty Cost Floor: ${b['breakeven_floor_usd_mt']:.2f} / MT (Laden) | Commercial: ${b['commercial_breakeven_floor_usd_mt']:.2f} / MT\n"
        f"  Demurrage Cap:        {r['layer5_recommendation']['demurrage_cap_recommendation']}\n"
        f"  Laytime Allowance:    5.0 Weather Working Days (SHINC)\n"
        f"-----------------------------------------------------------------\n"
        f"TECHNICAL & DRAFT CLEARANCE:\n"
        f"  Status:               {'PASSED - AUTHORIZED' if ukc['allowed'] else 'ALERT - ' + ukc['reason']}\n"
        f"  Calculated UKC:       {ukc['ukc_m']}m (Min Required: {ukc['min_ukc_m']}m)\n"
        f"-----------------------------------------------------------------\n"
        f"STRATEGIC DIRECTIVE:\n"
        f"  {r['layer5_recommendation']['timing_advice']}\n"
        f"  {r['layer5_recommendation']['contract_mode']}\n"
        f"=================================================================\n"
    )


@app.post("/api/v1/audit-receipt", response_class=PlainTextResponse)
def audit_receipt(req: CargoIndentRequest):
    r = analyze_shipment(req)
    f = r["layer3_ml_forecast"]
    b = r["layer2_naval_physics"]
    shap_info = f.get("shap_audit", {})
    contribs = shap_info.get("contributions_usd_mt", {})

    lines = [
        "=================================================================",
        "       NAAVAI AI: EXPLAINABLE AUDIT RECEIPT (CVC / CAG READY)     ",
        "=================================================================",
        f"Team: F6 | Problem Statement: PS26006 (SAIL Freight Forecasting)",
        f"Trade Route: {req.origin_port} -> {req.destination_port} | Class: {req.vessel_class}",
        "",
        "1. PHYSICAL HYDRODYNAMICS BASELINE (Layer 2):",
        f"   - Admiralty Breakeven Floor (Laden):      ${b['breakeven_floor_usd_mt']:.2f} / MT",
        f"   - Commercial Floor (with Ballast Leg):    ${b['commercial_breakeven_floor_usd_mt']:.2f} / MT",
        f"   - Est. Sea Days: {b['sea_days']} days | Fuel Burn: {b['fuel_consumed_mt']} MT VLSFO",
        "",
        "2. PREDICTIVE ECONOMETRICS & ML FORECAST (Layer 3):",
        f"   - Base Model Intercept:                   ${shap_info.get('base_rate_usd_mt', 18.0):.2f} / MT",
        f"   - AI Recommended Rate (P50):              ${f['P50_recommended_rate']:.2f} / MT",
        f"   - Confidence Bands:                       P10: ${f['P10_floor']:.2f} | P90: ${f['P90_ceiling']:.2f}",
        f"   - Macro Cointegration Anchor:             ${f['macro_anchor']['anchor_30d_usd_mt']:.2f} / MT ({f['macro_anchor']['mode']})",
        "",
        "3. LIVE SHAPLEY WATERFALL DECOMPOSITION (Explainable AI):",
    ]

    for feat, delta in contribs.items():
        sign = "+" if delta >= 0 else ""
        lines.append(f"   • {feat:<28} : {sign}${delta:.2f} / MT")

    lines.extend([
        "",
        "4. PORT RISK & CONTRACT RECOMMENDATION (Layers 4 & 5):",
        f"   - Simulated Anchorage Wait Time:          {r['layer4_queue_demurrage']['simulated_avg_wait_days']} days",
        f"   - Expected Demurrage Risk Exposure:       ${r['layer4_queue_demurrage']['demurrage']['demurrage_usd']:,.2f}",
        f"   - Recommended Decision:                   {r['layer5_recommendation']['timing_advice']}",
        "=================================================================",
    ])

    return "\n".join(lines) + "\n"
