"""Layer 2b: Port clearance checker - UKC + LOA/Beam constraints. Team F6."""

PORT_LIMITS = {
    "Paradip": {"charted_depth": 15.5, "min_ukc": 0.8, "max_loa": 260, "max_beam": 48, "geared_required": False},
    "Visakhapatnam": {"charted_depth": 19.0, "min_ukc": 0.8, "max_loa": 300, "max_beam": 50, "geared_required": False},
    "Haldia": {"charted_depth": 8.5, "min_ukc": 1.0, "max_loa": 230, "max_beam": 32, "geared_required": True},
    "Dhamra": {"charted_depth": 18.0, "min_ukc": 0.8, "max_loa": 300, "max_beam": 50, "geared_required": False},
    "Gangavaram": {"charted_depth": 19.5, "min_ukc": 0.8, "max_loa": 300, "max_beam": 50, "geared_required": False},
}

VESSEL_DIMS = {
    "Capesize": {"draft": 17.5, "ballast_draft": 7.0, "dwt": 180000, "loa": 292, "beam": 45.0, "geared": False},
    "Kamsarmax": {"draft": 14.4, "ballast_draft": 5.8, "dwt": 82000, "loa": 229, "beam": 32.26, "geared": False},
    "Panamax": {"draft": 13.5, "ballast_draft": 5.5, "dwt": 75000, "loa": 225, "beam": 32.26, "geared": False},
    "Supramax": {"draft": 12.5, "ballast_draft": 5.0, "dwt": 58000, "loa": 200, "beam": 32.26, "geared": True},
}


def check_clearance(port: str, vessel_class: str, cargo_tonnage: float = None, tidal_height: float = 1.0, squat: float = 0.3) -> dict:
    limits = PORT_LIMITS.get(port)
    dims = VESSEL_DIMS.get(vessel_class)
    if limits is None or dims is None:
        unknown = []
        if limits is None:
            unknown.append(f"unsupported destination port '{port}'")
        if dims is None:
            unknown.append(f"unsupported vessel class '{vessel_class}'")
        return {
            "port": port, "vessel_class": vessel_class, "allowed": False,
            "operating_draft_m": None, "ukc_m": None, "min_ukc_m": None,
            "max_permissible_cargo_mt": 0.0,
            "checks": {"ukc": False, "loa": False, "beam": False, "gear": False},
            "reason": "REJECTED: " + "; ".join(unknown),
        }
    
    # Haldia estuarine tidal boost (Hooghly river navigation typically timed at high water 2.0-3.0m)
    if port == "Haldia" and tidal_height <= 1.0:
        effective_tide = 2.2  # realistic high-water convoy tide at Haldia
    else:
        effective_tide = tidal_height

    # Compute operating draft based on parcel weight (tonnage lightening)
    if cargo_tonnage and cargo_tonnage > 0:
        utilization = min(1.0, cargo_tonnage / dims["dwt"])
        operating_draft = dims["ballast_draft"] + (dims["draft"] - dims["ballast_draft"]) * utilization
    else:
        operating_draft = dims["draft"]

    ukc = limits["charted_depth"] + effective_tide - (operating_draft + squat)
    ok_ukc = ukc >= limits["min_ukc"]
    ok_loa = dims["loa"] <= limits["max_loa"]
    ok_beam = dims["beam"] <= limits["max_beam"]
    ok_gear = (not limits["geared_required"]) or dims["geared"]
    allowed = ok_ukc and ok_loa and ok_beam and ok_gear

    # Compute maximum permissible parcel tonnage at this port/tide
    max_allowable_draft = limits["charted_depth"] + effective_tide - limits["min_ukc"] - squat
    if max_allowable_draft <= dims["ballast_draft"]:
        max_cargo_mt = 0.0
    else:
        max_cargo_ratio = min(1.0, (max_allowable_draft - dims["ballast_draft"]) / (dims["draft"] - dims["ballast_draft"]))
        max_cargo_mt = round(max_cargo_ratio * dims["dwt"], 0)

    # Detailed operational reasoning & guidance
    failures = []
    if not ok_ukc:
        failures.append(f"UKC shortfall ({round(ukc, 2)}m < min {limits['min_ukc']}m; draft is {round(operating_draft, 2)}m)")
    if not ok_loa:
        failures.append(f"LOA exceeds berth max ({dims['loa']}m > {limits['max_loa']}m)")
    if not ok_beam:
        failures.append(f"Beam exceeds lock/chute max ({dims['beam']}m > {limits['max_beam']}m)")
    if not ok_gear:
        failures.append(f"Port requires onboard cranes/grabs (geared vessel mandatory)")

    if allowed:
        reason = "OK - Vessel & parcel cleared for docking"
    else:
        reason = "REJECTED: " + "; ".join(failures)
        if not ok_ukc and max_cargo_mt > 0 and dims["geared"] and limits["geared_required"]:
            reason += f". Suggested parcel lightening: reduce cargo to <= {int(max_cargo_mt):,} MT or use two-port discharge (Dhamra/Haldia)."

    return {
        "port": port,
        "vessel_class": vessel_class,
        "operating_draft_m": round(operating_draft, 2),
        "ukc_m": round(ukc, 2),
        "min_ukc_m": limits["min_ukc"],
        "max_permissible_cargo_mt": max_cargo_mt,
        "checks": {"ukc": ok_ukc, "loa": ok_loa, "beam": ok_beam, "gear": ok_gear},
        "allowed": allowed,
        "reason": reason,
    }
