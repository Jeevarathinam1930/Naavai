"""Layer 4: M/M/c port queue + demurrage. Team F6."""
import math


PORT_QUEUE_SPECS = {
    "Paradip": {"berths": 2, "daily_discharge_mt": 25000, "default_arrival_rate": 0.75, "laytime_days": 5.0, "demurrage_usd_day": 21000},
    "Visakhapatnam": {"berths": 2, "daily_discharge_mt": 30000, "default_arrival_rate": 0.65, "laytime_days": 4.5, "demurrage_usd_day": 22000},
    "Haldia": {"berths": 1, "daily_discharge_mt": 12000, "default_arrival_rate": 0.35, "laytime_days": 6.5, "demurrage_usd_day": 18000},
    "Dhamra": {"berths": 2, "daily_discharge_mt": 35000, "default_arrival_rate": 0.50, "laytime_days": 4.0, "demurrage_usd_day": 22000},
    "Gangavaram": {"berths": 2, "daily_discharge_mt": 35000, "default_arrival_rate": 0.45, "laytime_days": 4.0, "demurrage_usd_day": 22000},
}


def mmc_wait(arrival_rate: float, service_rate: float, berths: int) -> dict:
    rho = arrival_rate / (berths * service_rate)
    if rho >= 1:
        return {"rho": round(rho, 3), "Wq_days": 8.0, "unstable": True}
    s = sum((berths * rho) ** n / math.factorial(n) for n in range(berths))
    s += (berths * rho) ** berths / (math.factorial(berths) * (1 - rho))
    p0 = 1 / s
    wq = ((berths * rho) ** berths * rho) / (math.factorial(berths) * (1 - rho) ** 2 * arrival_rate) * p0
    return {"rho": round(rho, 3), "Wq_days": round(wq, 2), "P0": round(p0, 4), "unstable": False}


def demurrage_exposure(wait_days: float, cargo_mt: float, discharge_rate_mt_day: float = 25000,
                       laytime_days: float = 5.0, dem_rate: float = 21000) -> dict:
    port_time = wait_days + cargo_mt / discharge_rate_mt_day
    excess = max(0.0, port_time - laytime_days)
    return {
        "port_time_days": round(port_time, 2),
        "excess_days": round(excess, 2),
        "demurrage_usd": round(excess * dem_rate, 2),
        "daily_demurrage_rate": dem_rate,
        "contractual_laytime_days": laytime_days,
    }


def simulate_port_discrete_event(port: str, incoming_cargo_mt: float, horizon_days: int = 30, seed: int = 42) -> dict:
    """Discrete-event simulation using SimPy for stochastic vessel arrival and queue wait."""
    try:
        import simpy
        import random
        random.seed(seed)
        env = simpy.Environment()
        cfg = PORT_QUEUE_SPECS.get(port, PORT_QUEUE_SPECS["Paradip"])
        berth_resource = simpy.Resource(env, capacity=cfg["berths"])

        wait_times = []

        def vessel(env, name, res, service_time):
            arrival = env.now
            with res.request() as req:
                yield req
                wait = env.now - arrival
                wait_times.append(wait)
                yield env.timeout(service_time)

        def vessel_generator(env, res):
            i = 0
            while env.now < horizon_days:
                inter_arrival = random.expovariate(cfg["default_arrival_rate"])
                yield env.timeout(inter_arrival)
                i += 1
                service = random.uniform(2.0, 3.5)
                env.process(vessel(env, f"Ship_{i}", res, service))

        env.process(vessel_generator(env, berth_resource))
        env.run(until=horizon_days)

        avg_wait = sum(wait_times) / len(wait_times) if wait_times else 2.5
        p90_wait = sorted(wait_times)[int(len(wait_times) * 0.9)] if len(wait_times) > 1 else avg_wait * 1.5
        dem = demurrage_exposure(avg_wait, incoming_cargo_mt, cfg["daily_discharge_mt"], cfg["laytime_days"], cfg["demurrage_usd_day"])
        return {
            "mode": "simpy_discrete_event",
            "simulated_ships": len(wait_times),
            "simulated_avg_wait_days": round(avg_wait, 2),
            "simulated_p90_wait_days": round(p90_wait, 2),
            "demurrage": dem,
        }
    except Exception as e:
        # Fallback to analytical M/M/c
        cfg = PORT_QUEUE_SPECS.get(port, PORT_QUEUE_SPECS["Paradip"])
        s_rate = cfg["daily_discharge_mt"] / max(incoming_cargo_mt, 50000)
        q = mmc_wait(cfg["default_arrival_rate"], s_rate, cfg["berths"])
        dem = demurrage_exposure(q["Wq_days"], incoming_cargo_mt, cfg["daily_discharge_mt"], cfg["laytime_days"], cfg["demurrage_usd_day"])
        return {"mode": f"analytical_mmc_fallback ({e})", "queue": q, "demurrage": dem}
