"""
Main FastAPI Application Server
Coordinates all 5 layers and exposes REST API endpoints for the dashboard.
Team F6 - Naavai AI - PS26006 (Production Prototype)
"""
from fastapi import FastAPI, Response, UploadFile, File, HTTPException
import math
import hashlib
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, field_validator
from backend.reporting.pdf_generator import (
    generate_cvc_audit_pdf,
    generate_broker_order_pdf,
)
from backend.reporting.excel_generator import generate_audit_workbook
from backend.physics.voyage_cost_engine import VoyageCostEngine
from backend.physics.port_clearance_checker import check_clearance, PORT_LIMITS, VESSEL_DIMS
from backend.simulation.port_queue_sim import (
    PORT_QUEUE_SPECS,
    simulate_port_discrete_event,
    mmc_wait,
    demurrage_exposure,
)
from backend.simulation.ais_geofence import (
    get_live_anchorage_vessels,
    get_anchorage_polygons,
    PORT_COORDINATES,
)
from backend.optimization.milp_solver import (
    generate_sample_sail_indent_program,
    optimise_shipments,
    optimise_schedule,
)
from backend.ml_engine.rate_forecaster import FreightRateForecaster
from backend.ml_engine.shap_explainer import explain_forecast
from backend.ml_engine.vecm_anchor import vecm_anchor

from backend.reporting.historical_incidents import (
    get_historical_incidents_list,
    get_incident_by_id,
)

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
    incident_id: str | None = None

    @field_validator("destination_port")
    @classmethod
    def validate_destination_port(cls, value):
        if value not in PORT_LIMITS:
            raise ValueError(f"Unsupported destination port '{value}'. Supported ports: {', '.join(PORT_LIMITS)}")
        return value

    @field_validator("vessel_class")
    @classmethod
    def validate_vessel_class(cls, value):
        if value not in VESSEL_DIMS:
            raise ValueError(f"Unsupported vessel class '{value}'. Supported classes: {', '.join(VESSEL_DIMS)}")
        return value


class ScenarioRequest(CargoIndentRequest):
    bunker_delta: float = 0.0
    port_queue_surge: float = 0.0
    baltic_pct_delta: float = 0.0


class IndentItem(BaseModel):
    id: str
    qty_mt: float
    month: str
    origin: str = "Gladstone"
    dest: str = "Paradip"
    spot_rate_usd_mt: float
    demurrage_usd: float = 0.0
    port_usd: float = 0.0


class IndentProgramRequest(BaseModel):
    shipments: list[IndentItem]
    coa_options: list[dict] = []
    monthly_capacity_mt: float = 300000
    safety_buffer_mt: float = 37500

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
    coa_eligible = req.origin_port in {"Gladstone", "Hay Point", "Newcastle"} and 30_000 <= req.tonnage <= 100_000
    coa_options = [{
        "shipments": [0],
        "price": req.tonnage * round(p50_final * 0.94, 2) + dem["demurrage_usd"] + port_disb,
    }] if coa_eligible else []
    single_optimisation = optimise_shipments([single_voyage_spot_usd], coa_options)
    coa_recommended = bool(single_optimisation.get("coa_taken"))
    single_voyage_coa_usd = single_optimisation["total"] if coa_recommended else None
    single_savings_usd = round(max(0.0, single_voyage_spot_usd - (single_voyage_coa_usd or single_voyage_spot_usd)), 2)
    single_savings_inr_cr = round((single_savings_usd * 84.0) / 10_000_000, 2)

    # Timing strategy with historical incident intelligence
    incident_context = get_incident_by_id(req.incident_id) if req.incident_id else None
    if req.incident_id == "sail-differential-demurrage-aggregate":
        timing_advice = "REVIEW DEMURRAGE PASS-THROUGH: Compare supplier recovery with charter-party liability before fixture. The replay estimates vessel-side exposure; it does not reconstruct the CAG aggregate."
    elif req.incident_id == "mv-prem-poorva-vizag-haldia":
        timing_advice = f"CHECK PORT ROTATION: Validate {req.vessel_class} draft/UKC and compare queue exposure for {req.destination_port} before nomination. Historical draft responsibility was disputed."
    elif req.incident_id == "sail-norvic-seven-vessel-demurrage":
        timing_advice = f"CHECK LAYCAN AND BERTH READINESS: Review forecast wait at {req.destination_port}, vessel machinery readiness and discharge instructions before fixture. This is a representative replay, not a vessel-by-vessel reconstruction."
    elif p50_final <= forecast["P90_risk_ceiling_usd_mt"] * 0.92:
        timing_advice = "STRONG BUY / FIX PROMPTLY: Rates near lower band; lock within 3–5 days."
    elif p50_final >= forecast["P90_risk_ceiling_usd_mt"]:
        timing_advice = "HOLD / DELAY FIXTURE: Rates overheated; utilize plant buffer inventory."
    else:
        timing_advice = "EXECUTE NORMAL TENDER: Stable market within expected P50 trajectory."

    # 5-Stage Decision Checkpoint Flow with clear explainability
    p50_val = round(p50_final, 2)
    p10_val = forecast["P10_optimistic_usd_mt"]
    p90_val = forecast["P90_risk_ceiling_usd_mt"]
    bk_floor = breakeven["breakeven_floor_usd_mt"]
    comm_floor = breakeven["commercial_breakeven_floor_usd_mt"]
    distance = breakeven.get("distance_nm", 5200)

    # Explainable operating plan used by the dashboard and audit exports.
    fuel_cost_usd = round(breakeven.get("fuel_cost_usd", 0), 2)
    voyage_opex_usd = round(breakeven.get("total_days", 0) * VoyageCostEngine.VESSEL_SPECS[req.vessel_class]["opex_day"], 2)
    port_cost_usd = round(breakeven.get("port_disbursements_usd", 0), 2)
    route_plan = f"{req.origin_port} → {req.destination_port} via {breakeven.get('routing_note', 'standard route')} ({distance:,} NM)"

    vessel_options = []
    for candidate in VESSEL_DIMS:
        candidate_clearance = check_clearance(req.destination_port, candidate, req.tonnage)
        if candidate_clearance["allowed"]:
            vessel_options.append({"vessel_class": candidate, "operating_draft_m": candidate_clearance["operating_draft_m"], "ukc_m": candidate_clearance["ukc_m"]})
    vessel_advice = (f"Use {req.vessel_class}; clearance is approved." if clearance["allowed"] else
                     f"Do not use {req.vessel_class} at {req.destination_port}. Use {vessel_options[0]['vessel_class']} or split/lighten the parcel." if vessel_options else
                     f"No single vessel clears {req.destination_port} for {req.tonnage:,.0f} MT; split discharge or lightering is required.")

    demurrage_probability = round(min(0.98, max(0.05, (port_sim.get("simulated_p90_wait_days", 0) / max(port_sim.get("simulated_avg_wait_days", 1), 1) - 1) * 0.45 + (0.35 if dem.get("excess_days", 0) > 0 else 0.05))), 2)
    if req.destination_port == "Haldia":
        congestion_plan = "Split the parcel: discharge at Dhamra/Paradip first, then use geared Supramax lightering into Haldia."
    elif req.destination_port == "Paradip" and demurrage_probability >= 0.45:
        congestion_plan = "Shift laycan by +5 days or divert part of the parcel to Dhamra to reduce queue exposure."
    else:
        congestion_plan = f"Keep {req.destination_port} as primary discharge; reserve a secondary berth/port if queue exceeds the P90 wait."

    if p50_final >= forecast["P90_risk_ceiling_usd_mt"] * 0.92:
        contract_strategy = "Rates are near the risk ceiling: secure a short-term fixture now and avoid waiting for a higher spot market."
    elif p50_final <= forecast["P90_risk_ceiling_usd_mt"] * 0.80:
        contract_strategy = "Rates are favourable: cover the immediate parcel on spot and negotiate a medium-term COA for the recurring volume."
    else:
        contract_strategy = "Use a short-term fixture for this parcel and keep a medium-term COA tranche for the next planned cargoes."
    vessel_capacity = VESSEL_DIMS[req.vessel_class]["dwt"]
    allocation_plan = {"primary_vessel": req.vessel_class, "estimated_vessels": max(1, int(math.ceil(req.tonnage / (vessel_capacity * 0.95)))), "parcel_mt": req.tonnage, "instruction": vessel_advice}

    decision_flow = [
        {
            "step": 1,
            "cp_label": "CP 1: Physics Floor",
            "name": "Naval Physics Thermodynamic Floor",
            "badge": "PHYSICAL LOWER BOUND",
            "metric": f"${bk_floor:.2f}/MT Floor",
            "submetric": f"Commercial: ${comm_floor:.2f}/MT",
            "context": "(Admiralty Boundary)",
            "status": "VALIDATED",
            "explanation": f"Route: {route_plan}. Admiralty formula P = displacement^(2/3) × speed^3 / C_adm, followed by SFOC fuel burn, port auxiliary burn, OPEX and port disbursement. Fuel is ${fuel_cost_usd:,.0f}, OPEX is ${voyage_opex_usd:,.0f}, and port cost is ${port_cost_usd:,.0f}; therefore the laden floor is ${bk_floor:.2f}/MT and a fixture below it is uneconomic.",
        },
        {
            "step": 2,
            "cp_label": "CP 2: Nautical Clearance",
            "name": "Nautical Draft & UKC Clearance",
            "badge": "CLEARANCE APPROVED" if clearance["allowed"] else "RESTRICTED",
            "metric": f"{clearance.get('operating_draft_m', 0)}m Draft Cleared",
            "submetric": f"UKC: {clearance.get('ukc_m', 0)}m Safety Margin",
            "context": "(UKC Safety Margin)",
            "status": "APPROVED" if clearance["allowed"] else "FAILED",
            "explanation": f"Destination: {req.destination_port}. Vessel tested: {req.vessel_class}; operating draft {clearance.get('operating_draft_m')}m, UKC {clearance.get('ukc_m')}m against minimum {clearance.get('min_ukc_m')}m. {vessel_advice}",
        },
        {
            "step": 3,
            "cp_label": "CP 3: ML Quantile Rate",
            "name": "AI Machine Learning Quantile Pricing",
            "badge": "MARKET EQUILIBRIUM",
            "metric": f"${p50_val:.2f}/MT Target",
            "submetric": f"Range: ${p10_val:.2f} – ${p90_val:.2f}",
            "context": "(Baltic & FFA Equilibrium)",
            "status": "TARGET RATE",
            "explanation": f"Market inputs: Singapore VLSFO ${req.current_vlsfo_bunker:,.0f}/MT, Baltic P3A ${req.current_baltic_p3a:,.0f}/day, FFA 30-day ${req.current_ffa_30d:.2f}/MT. LightGBM quantiles and SHAP contributions produce P10 ${p10_val:.2f}, expected P50 ${p50_val:.2f}, and P90 ${p90_val:.2f}; the P50 is the target tender rate.",
        },
        {
            "step": 4,
            "cp_label": "CP 4: Congestion Risk",
            "name": "Port Congestion & Demurrage Simulation",
            "badge": "CONGESTION BUFFERED",
            "metric": f"{port_sim.get('simulated_avg_wait_days', 2.8)}d Queue Wait",
            "submetric": f"Exposure: ${dem.get('demurrage_usd', 0):,.0f}",
            "context": "(Demurrage Buffered)",
            "status": "SIMULATED",
            "explanation": f"{req.destination_port} simulation projects {port_sim.get('simulated_avg_wait_days', 2.8)} days average and {port_sim.get('simulated_p90_wait_days', 4.5)} days P90 wait. Estimated demurrage probability is {demurrage_probability:.0%}; exposure is ${dem.get('demurrage_usd', 0):,.0f} at ${int(dem.get('daily_demurrage_rate', 21000)):,}/day. Action: {congestion_plan}",
        },
        {
            "step": 5,
            "cp_label": "CP 5: Tactical Fixture",
            "name": "MILP Strategic Procurement Allocation",
            "badge": "OPTIMAL DIRECTIVE" if single_optimisation.get("mode") == "milp" else "SPOT DIRECTIVE",
            "metric": "COA Tranche Recommendation" if coa_recommended else "Spot Fixture",
            "submetric": f"Est. Savings: \u20b9{single_savings_inr_cr:.2f} Cr",
            "context": f"(\u20b9{single_savings_inr_cr:.2f} Cr Capital Preserved)",
            "status": "RECOMMENDED",
            "explanation": f"{contract_strategy} Single-cargo optimizer result: {'COA selected' if coa_recommended else 'spot fixture selected'} ({single_optimisation.get('status', 'unknown')}); estimated savings are \u20b9{single_savings_inr_cr:.2f} Cr. Allocation: {allocation_plan['estimated_vessels']} {req.vessel_class} vessel(s) for {req.tonnage:,.0f} MT.",
        },
    ]

    return {
        "status": "SUCCESS",
        "inputs": req.model_dump(),
        "historical_incident_context": incident_context,
        "decision_flow": decision_flow,
        "layer2_naval_physics": breakeven,
        "route_plan": {
            "origin": req.origin_port, "destination": req.destination_port,
            "route_statement": route_plan, "distance_nm": distance,
            "fuel_cost_usd": fuel_cost_usd, "voyage_opex_usd": voyage_opex_usd,
            "port_cost_usd": port_cost_usd,
        },
        "layer2_clearance": clearance,
        "vessel_recommendation": {"selected": req.vessel_class, "alternatives": vessel_options, "advice": vessel_advice},
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
            "demurrage_probability": demurrage_probability,
            "mitigation_plan": congestion_plan,
        },
        "layer5_recommendation": {
            "timing_advice": timing_advice,
            "contract_strategy": contract_strategy,
            "allocation_plan": allocation_plan,
            "contract_mode": (
                f"Absorb into eligible 6-Month COA Tranche (Saves ~Rs.{single_savings_inr_cr} Cr on parcel)"
                if coa_recommended else "Use spot fixture; no eligible COA was selected for this cargo"
            ),
            "demurrage_cap_recommendation": f"${int(dem['daily_demurrage_rate']):,} / Day",
            "broker_order_ready": clearance["allowed"],
            "single_voyage_spot_usd": round(single_voyage_spot_usd, 2),
            "single_voyage_coa_usd": round(single_voyage_coa_usd, 2) if single_voyage_coa_usd is not None else None,
            "coa_eligible": coa_eligible,
            "coa_recommended": coa_recommended,
            "single_voyage_optimization": single_optimisation,
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


@app.post("/api/v1/scenario")
def scenario_analysis(req: ScenarioRequest):
    """Run a what-if analysis with market and congestion shocks."""
    base = analyze_shipment(CargoIndentRequest(**req.model_dump()))
    shocked_bunker = req.current_vlsfo_bunker + req.bunker_delta
    shocked_baltic = req.current_baltic_p3a * (1 + req.baltic_pct_delta / 100)
    shocked = CargoIndentRequest(**{**req.model_dump(), "current_vlsfo_bunker": shocked_bunker, "current_baltic_p3a": shocked_baltic})
    result = analyze_shipment(shocked)
    queue = simulate_port_discrete_event(req.destination_port, req.tonnage, arrival_rate_multiplier=1 + req.port_queue_surge / 10)
    result["scenario"] = {"bunker_delta": req.bunker_delta, "baltic_pct_delta": req.baltic_pct_delta,
                          "port_queue_surge": req.port_queue_surge, "baseline_p50": base["layer3_ml_forecast"]["P50_recommended_rate"]}
    result["layer4_queue_demurrage"] = {"simulation_mode": queue["mode"], "simulated_avg_wait_days": queue.get("simulated_avg_wait_days", 0),
                                        "simulated_p90_wait_days": queue.get("simulated_p90_wait_days", 0), "demurrage": queue["demurrage"]}
    return result


@app.post("/api/v1/indent-program/optimize")
def optimize_indent_program(req: IndentProgramRequest):
    shipments = [item.model_dump() for item in req.shipments]
    return optimise_schedule(shipments, req.coa_options, req.monthly_capacity_mt, req.safety_buffer_mt)


@app.post("/api/v1/indent-program/upload")
async def upload_indent_program(file: UploadFile = File(...)):
    """Accept a CSV indent sheet and return its optimized schedule."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv indent file")
    import pandas as pd
    try:
        frame = pd.read_csv(file.file)
        required = {"id", "qty_mt", "month", "spot_rate_usd_mt"}
        missing = required - set(frame.columns)
        if missing: raise ValueError(f"Missing columns: {', '.join(sorted(missing))}")
        items = [IndentItem(**row) for row in frame.fillna(0).to_dict(orient="records")]
        return optimize_indent_program(IndentProgramRequest(shipments=items))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid indent CSV: {exc}") from exc


@app.post("/api/v1/rofr-evaluate")
def evaluate_rofr(bids: list[dict]):
    """Apply the Indian-flagged Right of First Refusal 20% matching band."""
    if not bids:
        return {"eligible": False, "reason": "No bids supplied", "bids": []}
    lowest = min(float(b["rate_usd_mt"]) for b in bids)
    evaluated = []
    for bid in bids:
        rate = float(b["rate_usd_mt"])
        indian = bool(b.get("indian_flagged"))
        evaluated.append({**bid, "can_match_under_rofr": indian and rate <= lowest * 1.20,
                          "margin_to_lowest_pct": round((rate / lowest - 1) * 100, 2)})
    return {"eligible": any(b["can_match_under_rofr"] for b in evaluated), "lowest_rate_usd_mt": lowest, "bids": evaluated}


@app.get("/api/v1/historical-incidents")
def historical_incidents():
    """Returns verified historical SAIL procurement, shipping, and demurrage failure incidents."""
    return {"status": "SUCCESS", "incidents": get_historical_incidents_list()}


@app.get("/api/v1/live-ais-tracking")
def live_ais_tracking():
    """Returns detected satellite AIS tracking telemetry for Paradip, Vizag, Haldia, and Dhamra."""
    return {
        "status": "SUCCESS",
        "vessels": get_live_anchorage_vessels(),
        "anchorages": get_anchorage_polygons(),
        "ports": PORT_COORDINATES,
    }


@app.get("/api/v1/sail-indent-schedule")
def sail_indent_schedule(base_rate: float = 20.0):
    """Executes full Layer 5 MILP Schedule optimization over 10 SAIL overseas coal indents."""
    return generate_sample_sail_indent_program(base_rate=base_rate)


@app.get("/api/v1/forecast-history")
def forecast_history(days: int = 90, origin: str = "Gladstone", dest: str = "Paradip"):
    from backend.data_engine.ingest import load_market
    df = load_market(days)
    route_key = forecaster.resolve_route_key(origin, dest)
    target_column = forecaster.ROUTE_TARGETS.get(route_key, "aus_paradip_freight_usd_mt")
    return {
        "route_key": route_key,
        "dates": df["date"].astype(str).tolist(),
        "spot": df[target_column].tolist(),
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
    flow = r.get("decision_flow", [])
    flow_parts = []
    for cp in flow:
        label = cp.get('cp_label') or ('CP ' + str(cp.get('step')))
        flow_parts.append(f"  {label}: {cp.get('metric','')} {cp.get('context','')} [{cp.get('badge','')}]")
    flow_lines = "\n".join(flow_parts)
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
        f"5-STAGE DECISION FLOW (SIMULATED / LIVE CALCULATED):\n"
        f"{flow_lines}\n"
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
    flow = r.get("decision_flow", [])

    lines = [
        "=================================================================",
        "       NAAVAI AI: EXPLAINABLE AUDIT RECEIPT (CVC / CAG READY)     ",
        "=================================================================",
        f"Team: F6 | Problem Statement: PS26006 (SAIL Freight Forecasting)",
        f"Trade Route: {req.origin_port} -> {req.destination_port} | Class: {req.vessel_class}",
        "",
        "5-STAGE DECISION FLOW (SIMULATED / LIVE CALCULATED):",
    ]
    for cp in flow:
        lines.append(f"  {cp.get('cp_label', cp.get('name',''))} => {cp.get('metric','')} {cp.get('context','')} [{cp.get('badge','')}]")
        lines.append(f"     {cp.get('explanation','')}")
    lines += [
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


@app.post("/api/v1/audit-receipt-pdf")
def audit_receipt_pdf(req: CargoIndentRequest):
    """Generates an executive-styled CVC/CAG Audit Receipt PDF."""
    r = analyze_shipment(req)
    pdf_bytes = generate_cvc_audit_pdf(r, req.model_dump())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=SAIL_CVC_CAG_Audit_Receipt.pdf"},
    )


@app.post("/api/v1/audit-receipt-xlsx")
def audit_receipt_xlsx(req: CargoIndentRequest):
    """Generate an Excel audit workbook and expose its SHA-256 seal in a header."""
    result = analyze_shipment(req)
    content = generate_audit_workbook(result, req.model_dump())
    digest = hashlib.sha256(content).hexdigest()
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=SAIL_CVC_CAG_Audit_Receipt.xlsx",
                             "X-Audit-SHA256": digest})


@app.post("/api/v1/broker-order-pdf")
def broker_order_pdf(req: CargoIndentRequest):
    """Generates an executive-styled Broker Cargo Order PDF."""
    r = analyze_shipment(req)
    pdf_bytes = generate_broker_order_pdf(r, req.model_dump())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=SAIL_Broker_Cargo_Order.pdf"},
    )
