"""
Layer 2: Physical Hydrodynamic & Voyage Cost Engine
Calculates Admiralty fuel consumption and sets the minimum breakeven floor.
Team F6 - Naavai AI - PS26006
"""
import math


class VoyageCostEngine:
    # Admiralty constants for dry bulk carrier classes
    VESSEL_SPECS = {
        "Capesize": {"dwt": 180000, "disp": 205000, "c_adm": 520, "aux_sea": 2.5, "aux_port": 3.5, "opex_day": 7800},
        "Kamsarmax": {"dwt": 82000, "disp": 96000, "c_adm": 480, "aux_sea": 2.2, "aux_port": 4.0, "opex_day": 6800},
        "Panamax": {"dwt": 75000, "disp": 88000, "c_adm": 460, "aux_sea": 2.0, "aux_port": 3.8, "opex_day": 6500},
        "Supramax": {"dwt": 58000, "disp": 69000, "c_adm": 430, "aux_sea": 1.8, "aux_port": 5.0, "opex_day": 5900},
    }

    PORT_DISBURSEMENTS = {
        "Capesize": 115000,
        "Kamsarmax": 85000,
        "Panamax": 78000,
        "Supramax": 65000,
    }

    # Nautical distances (nautical miles)
    ROUTES_NM = {
        ("Gladstone", "Paradip"): 4850,
        ("Gladstone", "Visakhapatnam"): 4780,
        ("Gladstone", "Haldia"): 4920,
        ("Gladstone", "Dhamra"): 4870,
        ("Gladstone", "Gangavaram"): 4790,
        ("Hay Point", "Paradip"): 4910,
        ("Hay Point", "Visakhapatnam"): 4840,
        ("Hay Point", "Haldia"): 4980,
        ("Hay Point", "Dhamra"): 4930,
        ("Newcastle", "Paradip"): 5200,
        ("Newcastle", "Visakhapatnam"): 5120,
        ("Newport News", "Visakhapatnam"): 9200,
        ("Newport News", "Paradip"): 9350,
        ("Mobile", "Visakhapatnam"): 9650,
        ("Maputo", "Dhamra"): 4600,
        ("Maputo", "Paradip"): 4680,
        ("Richards Bay", "Paradip"): 4850,
        ("Samarinda", "Haldia"): 2350,
        ("Samarinda", "Paradip"): 2280,
        ("Muara Pantai", "Haldia"): 2200,
    }

    @classmethod
    def calculate_fuel_burn_per_day(cls, vessel_class: str, speed_knots: float) -> float:
        specs = cls.VESSEL_SPECS[vessel_class]
        # Admiralty Formula: Power = (Disp^(2/3) * V^3) / C_adm
        power_kw = (math.pow(specs["disp"], 2 / 3) * math.pow(speed_knots, 3)) / specs["c_adm"]
        # Daily fuel burn: (Power * SFOC * 24) / 10^6 + Auxiliary
        sfoc_g_kwh = 165.0
        fuel_main_mt_day = (power_kw * sfoc_g_kwh * 24) / 1_000_000
        return fuel_main_mt_day + specs["aux_sea"]

    @classmethod
    def compute_breakeven_floor(cls, origin: str, dest: str, vessel_class: str, bunker_price: float,
                                cargo_tonnage: float = None, include_ballast_share: float = 0.35) -> dict:
        dist_nm = cls.ROUTES_NM.get((origin, dest))
        is_estimated_dist = False
        if dist_nm is None:
            # Smart nautical distance approximation if not in explicit table
            dist_nm = 4850
            is_estimated_dist = True

        specs = cls.VESSEL_SPECS[vessel_class]
        speed = 12.5  # standard laden eco-speed in knots
        ballast_speed = 13.5  # ballast speed is faster due to lower resistance

        sea_days = dist_nm / (speed * 24)
        port_days = 6.0  # 3 days loading + 3 days discharge
        total_days = sea_days + port_days

        fuel_per_day = cls.calculate_fuel_burn_per_day(vessel_class, speed)
        laden_fuel_mt = (sea_days * fuel_per_day) + (port_days * specs["aux_port"])
        laden_fuel_cost = laden_fuel_mt * bunker_price

        total_opex = total_days * specs["opex_day"]
        port_disbursements = cls.PORT_DISBURSEMENTS.get(vessel_class, 85000)

        pure_laden_cost = laden_fuel_cost + total_opex + port_disbursements
        cargo_carried = cargo_tonnage if (cargo_tonnage and cargo_tonnage > 0) else (specs["dwt"] * 0.95)

        breakeven_usd_mt = pure_laden_cost / cargo_carried

        # Commercial market floor including ballast repositioning share (typically 35%-50% allocated to front haul)
        ballast_days = (dist_nm / (ballast_speed * 24)) * include_ballast_share
        ballast_fuel_per_day = fuel_per_day * 0.85
        ballast_fuel_cost = ballast_days * ballast_fuel_per_day * bunker_price
        ballast_opex = ballast_days * specs["opex_day"]
        commercial_floor_usd_mt = (pure_laden_cost + ballast_fuel_cost + ballast_opex) / cargo_carried

        return {
            "vessel_class": vessel_class,
            "origin": origin,
            "destination": dest,
            "distance_nm": dist_nm,
            "is_estimated_distance": is_estimated_dist,
            "sea_days": round(sea_days, 1),
            "total_days": round(total_days, 1),
            "fuel_consumed_mt": round(laden_fuel_mt, 1),
            "fuel_cost_usd": round(laden_fuel_cost, 2),
            "port_disbursements_usd": port_disbursements,
            "breakeven_floor_usd_mt": round(breakeven_usd_mt, 2),
            "commercial_breakeven_floor_usd_mt": round(commercial_floor_usd_mt, 2),
        }


if __name__ == "__main__":
    # Sprint 1 unit test
    for vc in ["Kamsarmax", "Panamax", "Supramax", "Capesize"]:
        r = VoyageCostEngine.compute_breakeven_floor("Gladstone", "Paradip", vc, 620.0)
        print(vc, r)
