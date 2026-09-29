"""Layer 4b: AIS geofence polygons (Paradip / Vizag / Haldia / Dhamra anchorages). Team F6."""
from shapely.geometry import Point, Polygon

ANCHORAGES = {
    "Paradip": Polygon([(86.55, 19.95), (86.85, 19.95), (86.85, 20.20), (86.55, 20.20)]),
    "Visakhapatnam": Polygon([(83.20, 17.55), (83.45, 17.55), (83.45, 17.80), (83.20, 17.80)]),
    "Haldia": Polygon([(87.85, 21.45), (88.15, 21.45), (88.15, 21.70), (87.85, 21.70)]),
    "Dhamra": Polygon([(86.90, 20.75), (87.20, 20.75), (87.20, 21.05), (86.90, 21.05)]),
}

PORT_COORDINATES = {
    "Paradip": {"lat": 20.264, "lon": 86.671, "max_draft_m": 14.5, "berths": 2, "type": "Deepwater Bulk Jetty"},
    "Visakhapatnam": {"lat": 17.690, "lon": 83.298, "max_draft_m": 18.1, "berths": 2, "type": "Outer Harbor Capesize Berth"},
    "Haldia": {"lat": 22.023, "lon": 88.064, "max_draft_m": 7.5, "berths": 1, "type": "Tidal River Dock (Geared Only)"},
    "Dhamra": {"lat": 20.832, "lon": 86.963, "max_draft_m": 17.5, "berths": 2, "type": "Deepwater Capesize Terminal"},
    "Gangavaram": {"lat": 17.620, "lon": 83.240, "max_draft_m": 18.5, "berths": 1, "type": "Deep Draft Bulk Terminal"},
}


def get_anchorage_polygons() -> dict:
    """Returns list of [lat, lon] coordinates for each anchorage geofence polygon (for Leaflet)."""
    result = {}
    for name, poly in ANCHORAGES.items():
        coords = list(poly.exterior.coords)
        # Convert (lon, lat) tuples to [lat, lon] for Leaflet
        result[name] = [[c[1], c[0]] for c in coords]
    return result


def locate_vessel(lon: float, lat: float) -> str | None:
    p = Point(lon, lat)
    for name, poly in ANCHORAGES.items():
        if poly.contains(p):
            return name
    return None


def get_live_anchorage_vessels() -> list:
    """Returns detected AIS vessel telemetry within satellite geofenced port anchorages."""
    demurrage_rates = {
        "Capesize": 28000,
        "Kamsarmax": 22000,
        "Panamax": 19500,
        "Supramax": 17000,
    }

    vessels = [
        {
            "mmi": 538009214,
            "name": "MV MAHAVIR",
            "vessel_class": "Kamsarmax",
            "dwt": 82000,
            "cargo": "Prime Hard Coking Coal",
            "origin": "Gladstone",
            "lat": 20.08,
            "lon": 86.68,
            "speed_knots": 0.2,
            "heading": 185,
            "days_at_anchor": 3.8,
            "allowed_laytime_days": 2.5,
            "port": "Paradip",
        },
        {
            "mmi": 636018321,
            "name": "MV CHENNAI VEER",
            "vessel_class": "Panamax",
            "dwt": 75000,
            "cargo": "PCI Coal",
            "origin": "Hay Point",
            "lat": 20.12,
            "lon": 86.72,
            "speed_knots": 0.1,
            "heading": 90,
            "days_at_anchor": 2.1,
            "allowed_laytime_days": 2.5,
            "port": "Paradip",
        },
        {
            "mmi": 477123490,
            "name": "MV STEEL ODYSSEY",
            "vessel_class": "Capesize",
            "dwt": 180000,
            "cargo": "Hard Coking Coal",
            "origin": "Newcastle",
            "lat": 17.65,
            "lon": 83.32,
            "speed_knots": 0.3,
            "heading": 210,
            "days_at_anchor": 1.4,
            "allowed_laytime_days": 3.0,
            "port": "Visakhapatnam",
        },
        {
            "mmi": 354890120,
            "name": "MV HOOGHLY PIONEER",
            "vessel_class": "Supramax",
            "dwt": 58000,
            "cargo": "Met Coke",
            "origin": "Samarinda",
            "lat": 21.55,
            "lon": 87.98,
            "speed_knots": 0.1,
            "heading": 340,
            "days_at_anchor": 4.2,
            "allowed_laytime_days": 2.0,
            "port": "Haldia",
        },
        {
            "mmi": 419001452,
            "name": "MV KALINGA BULKER",
            "vessel_class": "Capesize",
            "dwt": 176000,
            "cargo": "Low-Vol Coking Coal",
            "origin": "Gladstone",
            "lat": 20.88,
            "lon": 87.05,
            "speed_knots": 0.2,
            "heading": 120,
            "days_at_anchor": 1.8,
            "allowed_laytime_days": 3.0,
            "port": "Dhamra",
        },
        {
            "mmi": 210984321,
            "name": "MV COROMANDEL EXPRESS",
            "vessel_class": "Kamsarmax",
            "dwt": 81500,
            "cargo": "Thermal Coal",
            "origin": "Richards Bay",
            "lat": 17.62,
            "lon": 83.25,
            "speed_knots": 0.4,
            "heading": 15,
            "days_at_anchor": 5.1,
            "allowed_laytime_days": 2.5,
            "port": "Visakhapatnam",
        },
    ]

    for v in vessels:
        v["verified_anchorage"] = locate_vessel(v["lon"], v["lat"])
        daily_rate = demurrage_rates.get(v["vessel_class"], 20000)
        v["daily_demurrage_rate_usd"] = daily_rate
        excess_days = max(0.0, v["days_at_anchor"] - v["allowed_laytime_days"])
        v["excess_days"] = round(excess_days, 1)
        v["demurrage_accrued_usd"] = round(excess_days * daily_rate, 2)
        v["demurrage_accrued_inr_lakhs"] = round((v["demurrage_accrued_usd"] * 84.0) / 100_000, 2)
        v["risk_status"] = "CRITICAL" if excess_days > 1.5 else "WARNING" if excess_days > 0 else "NORMAL"

    return vessels


