"""Verified, source-backed historical case studies used by Incident Replay.

Reported amounts remain separate from Naavai's simulated engine outputs. Where a
public source does not disclose a voyage input, the replay input is explicitly
marked as a simulation assumption in ``sourceNote``.
"""

HISTORICAL_INCIDENTS = [
    {
        "id": "sail-differential-demurrage-aggregate", "tag": "TSD / DIFFERENTIAL DEMURRAGE",
        "period": "FY 2017-18 to 2023-24", "year": "FY 2017-18 to 2023-24",
        "title": "SAIL Supplier–Shipowner Demurrage Mismatch",
        "source": "CAG Report No. 10 of 2025, section 4.3.5",
        "sourceUrl": "https://cag.gov.in/webroot/uploads/download_audit_report/2025/Report-No.-10-of-2025_Commercial_English-%2802-06-2025%29-0688c6e7a787f56.02536410.pdf",
        "sourceStatus": "primary",
        "sourceNote": "CAG aggregate finding across 374 voyage cases. The public audit paragraph does not disclose one vessel's tonnage, delay or invoice; the replay input is a representative simulation and is not a reconstruction of ₹54.27 Cr.",
        "financial_loss": "₹54.27 Cr", "financialLabel": "CAG-reported aggregate differential expenditure", "reportedLossCr": 54.27,
        "summary": "SAIL paid shipowners higher demurrage than it recovered from suppliers because supplier and charter-party rates were not aligned.",
        "historical_failure": "Different demurrage bases, fixed caps and charter-party rates left a cost differential with SAIL.",
        "naavai_solution": "Compare supplier recovery and shipowner liability before fixture; flag the unrecovered daily differential and recommend an aligned index or charter-party rate.",
        "quantified_savings": None, "heroStage": 4,
        "inputs": {"cargo_type": "Prime Hard Coking Coal", "tonnage": 80000, "origin_port": "Hay Point", "destination_port": "Paradip", "vessel_class": "Kamsarmax", "current_vlsfo_bunker": 660.0, "current_baltic_p3a": 21500.0, "current_ffa_30d": 22.8},
        "stages": [
            {"n": 1, "status": "info", "origin": "engine", "oneLine": "Lowest no-loss voyage rate", "detail": "Cost floor is calculated for the representative replay parcel."},
            {"n": 2, "status": "ok", "origin": "engine", "oneLine": "Draft and under-keel clearance", "detail": "The selected vessel and destination are checked by the clearance engine."},
            {"n": 3, "status": "info", "origin": "engine", "oneLine": "Fair market freight range", "detail": "P10, P50 and P90 are recalculated from replay market inputs."},
            {"n": 4, "status": "critical", "origin": "report", "oneLine": "Owner demurrage versus supplier recovery", "detail": "The CAG finding identifies a differential between what SAIL paid vessel owners and recovered from suppliers."},
            {"n": 5, "status": "ok", "origin": "report", "oneLine": "Action for the cargo plan", "detail": "Align the supplier rate with the charter-party or an agreed index before nomination."}
        ],
        "hero": {"wentWrong": ["Supplier and shipowner demurrage terms were not aligned.", "Across the audited periods, the resulting differential expenditure borne by SAIL totalled ₹54.27 Cr."], "naavaiAdvice": "Show the daily unrecovered differential before fixture and align the recovery formula.", "supporting": ["The engine calculates vessel-side queue and demurrage exposure for the representative parcel.", "The reported ₹54.27 Cr remains an aggregate audit figure, separate from the simulation."], "avoidedCr": None, "preventableExposureCr": None}
    },
    {
        "id": "mv-prem-poorva-vizag-haldia", "tag": "TSD / DRAFT & CONGESTION",
        "period": "28 Oct to 22 Nov 2005", "year": "2005",
        "title": "MV Prem Poorva — Draft, Congestion and Re-berthing",
        "source": "Bombay High Court judgment, 21 December 2012",
        "sourceUrl": "https://indiankanoon.org/doc/167387658/", "sourceStatus": "primary",
        "sourceNote": "Court-recorded voyage facts. Demurrage and freight rates were not disclosed in the accessible judgment extract; any rate shown by the engine is a simulation input, not a historical invoice value. Draft responsibility was disputed.",
        "financial_loss": "₹89.63 lakh awarded", "financialLabel": "Arbitration award across disputed voyage accounts", "reportedLossCr": 0.8963,
        "summary": "MV Prem Poorva waited at Vizag, was shifted and re-berthed, then faced Haldia congestion; draft and port-call planning were disputed in arbitration.",
        "historical_failure": "A deep-draft port-call plan, berth sequence and vessel readiness were not aligned with the actual port constraints and queue.",
        "naavai_solution": "Check draft and UKC at each candidate discharge port, compare port queue exposure and nominate the feasible port rotation before fixture.",
        "quantified_savings": None, "heroStage": 2,
        "inputs": {"cargo_type": "Bulk Coal", "tonnage": 67996, "origin_port": "Hay Point", "destination_port": "Visakhapatnam", "vessel_class": "Panamax", "current_vlsfo_bunker": 540.0, "current_baltic_p3a": 14200.0, "current_ffa_30d": 16.5},
        "stages": [
            {"n": 1, "status": "info", "origin": "engine", "oneLine": "Lowest no-loss voyage rate", "detail": "Cost floor is calculated from the recorded cargo quantity and representative market inputs."},
            {"n": 2, "status": "critical", "origin": "report", "oneLine": "Draft and port-call feasibility", "detail": "The judgment records a disputed draft/Paradip issue and a Vizag/Haldia port-call problem."},
            {"n": 3, "status": "info", "origin": "engine", "oneLine": "Fair market freight range", "detail": "The market forecast is recalculated for the replay assumptions."},
            {"n": 4, "status": "warn", "origin": "report", "oneLine": "Waiting and re-berthing exposure", "detail": "The judgment records Vizag waiting, shifting/re-berthing and Haldia congestion."},
            {"n": 5, "status": "ok", "origin": "engine", "oneLine": "Action for the cargo plan", "detail": "Use the clearance and queue result to choose a feasible port rotation."}
        ],
        "hero": {"wentWrong": ["The vessel waited at Vizag from arrival to berth, was later shifted and re-berthed, and then faced Haldia congestion.", "The court recorded an arbitration award of ₹89,62,656 plus ₹85,000 costs; the award is not treated as wholly avoidable congestion loss."], "naavaiAdvice": "Screen vessel draft and queue exposure before fixing the Vizag/Haldia rotation.", "supporting": ["The engine recalculates draft/UKC and port waiting exposure for the replay inputs.", "The recorded award and the simulated result are shown separately."], "avoidedCr": None, "preventableExposureCr": None}
    },
    {
        "id": "sail-norvic-seven-vessel-demurrage", "tag": "TSD / MULTI-VESSEL DEMURRAGE",
        "period": "May 2019 to May 2020", "year": "2019-20",
        "title": "SAIL/Norvic — Seven-Vessel Berth and Demurrage Dispute",
        "source": "Delhi High Court judgment, 22 September 2026",
        "sourceUrl": "https://indiankanoon.org/doc/53280060/", "sourceStatus": "primary",
        "sourceNote": "The judgment records seven vessel timelines and claimed demurrage, but not every vessel's cargo quantity or final paid invoice. The replay runs a representative Haldia parcel; vessel-specific claims remain report context.",
        "financial_loss": "$272,964.01 claimed demurrage", "financialLabel": "Aggregate demurrage claim (not confirmed paid loss)", "reportedLossCr": None,
        "summary": "Seven SAIL charter voyages recorded berth waits, anchorage events, a generator problem, communication issues and cyclone-related disruption at Vizag, Paradip and Haldia.",
        "historical_failure": "Berth/anchorage planning, machinery readiness and discharge instructions created vessel-specific waiting and demurrage claims.",
        "naavai_solution": "Forecast berth wait, validate vessel readiness and calculate demurrage exposure before accepting the laycan and discharge plan.",
        "quantified_savings": None, "heroStage": 4,
        "inputs": {"cargo_type": "Bulk Coal", "tonnage": 75000, "origin_port": "Hay Point", "destination_port": "Haldia", "vessel_class": "Kamsarmax", "current_vlsfo_bunker": 620.0, "current_baltic_p3a": 19500.0, "current_ffa_30d": 21.0},
        "stages": [
            {"n": 1, "status": "info", "origin": "engine", "oneLine": "Lowest no-loss voyage rate", "detail": "Cost floor is calculated for the representative replay parcel."},
            {"n": 2, "status": "ok", "origin": "engine", "oneLine": "Draft and under-keel clearance", "detail": "The selected Haldia vessel is checked against the port clearance rules."},
            {"n": 3, "status": "info", "origin": "engine", "oneLine": "Fair market freight range", "detail": "P10, P50 and P90 are recalculated from replay market inputs."},
            {"n": 4, "status": "critical", "origin": "report", "oneLine": "Berth wait and demurrage exposure", "detail": "The judgment records vessel-specific waiting and demurrage claims at Indian ports."},
            {"n": 5, "status": "ok", "origin": "engine", "oneLine": "Action for the cargo plan", "detail": "Use queue, discharge and readiness results to set a safer laycan and demurrage cap."}
        ],
        "hero": {"wentWrong": ["Seven vessels experienced different berth, anchorage or operational delays between May 2019 and May 2020.", "The judgment lists aggregate claimed demurrage of $272,964.01 across the seven vessels; claims are not presented as a single paid-loss figure."], "naavaiAdvice": "Pre-calculate berth wait and demurrage exposure before fixing the vessel and laycan.", "supporting": ["The engine recalculates a representative vessel's draft, queue wait and demurrage.", "Vessel-specific claimed amounts remain separate report evidence."], "avoidedCr": None, "preventableExposureCr": None}
    }
]


def get_historical_incidents_list() -> list:
    return HISTORICAL_INCIDENTS


def get_incident_by_id(incident_id: str) -> dict | None:
    return next((inc for inc in HISTORICAL_INCIDENTS if inc["id"] == incident_id), None)
