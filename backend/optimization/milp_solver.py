"""Layer 5: MILP Spot vs COA optimiser with safety-stock + port capacity. Team F6."""
try:
    from ortools.linear_solver import pywraplp
    _HAS_OR = True
except Exception:
    _HAS_OR = False


def optimise_shipments(spot_costs: list, coa_options: list):
    """spot_costs: list[float] per shipment. coa_options: list of {shipments:[idx], price:float}."""
    n = len(spot_costs)
    if not _HAS_OR:
        return {"mode": "greedy-fallback", "status": "solver_unavailable", "spot": list(range(n)), "coa_taken": [], "total": round(sum(spot_costs), 2)}
    solver = pywraplp.Solver.CreateSolver("SCIP")
    if solver is None:
        return {"mode": "greedy-fallback", "status": "solver_unavailable", "spot": list(range(n)), "coa_taken": [], "total": round(sum(spot_costs), 2)}
    x = [solver.IntVar(0, 1, f"x{i}") for i in range(n)]
    y = [solver.IntVar(0, 1, f"y{k}") for k in range(len(coa_options))]
    for i in range(n):
        covering = [y[k] for k, c in enumerate(coa_options) if i in c["shipments"]]
        solver.Add(x[i] + sum(covering) == 1)
    obj = solver.Objective()
    for i, c in enumerate(spot_costs):
        obj.SetCoefficient(x[i], c)
    for k, c in enumerate(coa_options):
        obj.SetCoefficient(y[k], c["price"])
    obj.SetMinimization()
    status = solver.Solve()
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return {
            "mode": "greedy-fallback",
            "status": "infeasible" if status == pywraplp.Solver.INFEASIBLE else "solver_failed",
            "spot": list(range(n)), "coa_taken": [], "total": round(sum(spot_costs), 2),
        }
    return {
        "mode": "milp",
        "status": "optimal" if status == pywraplp.Solver.OPTIMAL else "feasible",
        "spot": [i for i in range(n) if x[i].solution_value() > 0.5],
        "coa_taken": [k for k in range(len(coa_options)) if y[k].solution_value() > 0.5],
        "total": round(obj.Value(), 2),
    }


def optimise_schedule(shipments: list, coa_options: list, monthly_capacity_mt: float = 300000,
                      safety_buffer_mt: float = 37500):
    """Full Sprint-3 schedule optimiser.

    shipments: [{id, qty_mt, month (YYYY-MM), spot_rate_usd_mt, demurrage_usd, port_usd}]
    Adds: (a) every cargo covered exactly once, (b) monthly port throughput cap,
    (c) plant safety-stock check flag (informational - verifies cumulative supply).
    """
    n = len(shipments)
    spot_totals = [s["qty_mt"] * s["spot_rate_usd_mt"] + s.get("demurrage_usd", 0) + s.get("port_usd", 0)
                   for s in shipments]
    coa_priced = []
    for c in coa_options:
        qty = sum(shipments[i]["qty_mt"] for i in c["shipments"])
        coa_priced.append({"shipments": c["shipments"], "price": c["coa_rate_usd_mt"] * qty})
    base = optimise_shipments(spot_totals, coa_priced)

    # Monthly capacity check
    from collections import defaultdict
    monthly = defaultdict(float)
    for i in base.get("spot", []):
        monthly[shipments[i]["month"]] += shipments[i]["qty_mt"]
    for k in base.get("coa_taken", []):
        for i in coa_options[k]["shipments"]:
            monthly[shipments[i]["month"]] += shipments[i]["qty_mt"]
    breaches = {m: round(q, 1) for m, q in monthly.items() if q > monthly_capacity_mt}

    # Safety stock: cumulative supply must stay above buffer each month
    cum, stock_ok = 0.0, True
    for m in sorted(monthly):
        cum += monthly[m] - 75000  # assumed 75kt monthly plant burn
        if cum < safety_buffer_mt - 75000:
            stock_ok = False
    # Calculate savings vs 100% pure spot chartering
    pure_spot_total = sum(spot_totals)
    savings_usd = max(0.0, pure_spot_total - base["total"])
    savings_inr_cr = round((savings_usd * 84.0) / 10_000_000, 2)  # @ 84 INR/USD

    # Construct human-readable assignment list
    assignments = []
    for i, s in enumerate(shipments):
        assigned_coa = None
        for k in base.get("coa_taken", []):
            if i in coa_options[k]["shipments"]:
                assigned_coa = coa_options[k].get("name", f"COA Tranche #{k+1}")
                break
        assignments.append({
            "shipment_id": s["id"],
            "month": s["month"],
            "route": f"{s.get('origin', 'Gladstone')} -> {s.get('dest', 'Paradip')}",
            "qty_mt": s["qty_mt"],
            "mode": "COA Package" if assigned_coa else "Spot Fixture",
            "allocated_package": assigned_coa,
            "effective_rate_usd_mt": s["spot_rate_usd_mt"] if not assigned_coa else s.get("coa_rate_usd_mt", round(s["spot_rate_usd_mt"] * 0.94, 2)),
        })

    return {
        **base,
        "pure_spot_baseline_total_usd": round(pure_spot_total, 2),
        "optimised_total_usd": round(base["total"], 2),
        "savings_usd": round(savings_usd, 2),
        "savings_inr_crores": savings_inr_cr,
        "assignments": assignments,
        "monthly_totals_mt": dict(monthly),
        "capacity_breaches_mt": breaches,
        "safety_stock_ok": stock_ok and not breaches,
        "assumptions": {
            "monthly_capacity_mt": monthly_capacity_mt,
            "monthly_burn_mt": 75000,
            "safety_buffer_mt": safety_buffer_mt,
        },
    }


def generate_sample_sail_indent_program(base_rate: float = 20.0) -> dict:
    """Generates a realistic 6-month SAIL CIG Indent schedule covering 10 overseas shipments."""
    shipments = [
        {"id": "INDENT-2026-10A", "origin": "Gladstone", "dest": "Paradip", "qty_mt": 75000, "month": "2026-10", "spot_rate_usd_mt": base_rate, "demurrage_usd": 32000, "port_usd": 85000},
        {"id": "INDENT-2026-10B", "origin": "Hay Point", "dest": "Visakhapatnam", "qty_mt": 75000, "month": "2026-10", "spot_rate_usd_mt": round(base_rate * 0.98, 2), "demurrage_usd": 18000, "port_usd": 85000},
        {"id": "INDENT-2026-11A", "origin": "Gladstone", "dest": "Paradip", "qty_mt": 75000, "month": "2026-11", "spot_rate_usd_mt": round(base_rate * 1.04, 2), "demurrage_usd": 25000, "port_usd": 85000},
        {"id": "INDENT-2026-11B", "origin": "Newport News", "dest": "Visakhapatnam", "qty_mt": 75000, "month": "2026-11", "spot_rate_usd_mt": round(base_rate * 1.85, 2), "demurrage_usd": 22000, "port_usd": 85000},
        {"id": "INDENT-2026-12A", "origin": "Gladstone", "dest": "Paradip", "qty_mt": 75000, "month": "2026-12", "spot_rate_usd_mt": round(base_rate * 1.08, 2), "demurrage_usd": 40000, "port_usd": 85000},
        {"id": "INDENT-2026-12B", "origin": "Samarinda", "dest": "Haldia", "qty_mt": 30000, "month": "2026-12", "spot_rate_usd_mt": round(base_rate * 0.72, 2), "demurrage_usd": 15000, "port_usd": 65000},
        {"id": "INDENT-2027-01A", "origin": "Gladstone", "dest": "Paradip", "qty_mt": 75000, "month": "2027-01", "spot_rate_usd_mt": round(base_rate * 1.02, 2), "demurrage_usd": 28000, "port_usd": 85000},
        {"id": "INDENT-2027-01B", "origin": "Maputo", "dest": "Dhamra", "qty_mt": 75000, "month": "2027-01", "spot_rate_usd_mt": round(base_rate * 0.95, 2), "demurrage_usd": 12000, "port_usd": 85000},
        {"id": "INDENT-2027-02A", "origin": "Hay Point", "dest": "Paradip", "qty_mt": 75000, "month": "2027-02", "spot_rate_usd_mt": round(base_rate * 0.97, 2), "demurrage_usd": 20000, "port_usd": 85000},
        {"id": "INDENT-2027-03A", "origin": "Gladstone", "dest": "Visakhapatnam", "qty_mt": 75000, "month": "2027-03", "spot_rate_usd_mt": round(base_rate * 1.05, 2), "demurrage_usd": 24000, "port_usd": 85000},
    ]

    # Prospective COA tranches offered by shipowners
    coa_options = [
        {
            "name": "COA-Tranche-A (Australia 4-Voyage Quarterly Package)",
            "shipments": [0, 2, 4, 6],
            "coa_rate_usd_mt": round(base_rate * 0.92, 2),  # 8% volume discount
        },
        {
            "name": "COA-Tranche-B (Aussie-Vizag 2-Voyage Package)",
            "shipments": [1, 9],
            "coa_rate_usd_mt": round(base_rate * 0.94, 2),  # 6% volume discount
        },
    ]

    return optimise_schedule(shipments, coa_options)
