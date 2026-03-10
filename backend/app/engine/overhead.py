from decimal import Decimal


def calculate_overhead(
    overhead_schedule: list[dict],
    month: int,
) -> tuple[Decimal, dict]:
    """
    Line-item overhead scheduling.
    overhead_schedule format: [{"name": "Rent", "monthly": {"1": 250000, ...}}, ...]
    All values in cents.
    Returns (total_overhead_cents, trace_dict).
    """
    month_key = str(month)
    components = []
    total = Decimal(0)

    for line in overhead_schedule:
        amount = Decimal(line.get("monthly", {}).get(month_key, 0))
        total += amount
        components.append({
            "label": line.get("name", "Overhead"),
            "value": int(amount),
            "source": "forecast_driver",
        })

    trace = {
        "value": int(total),
        "formula": "sum of overhead line items",
        "components": components,
    }
    return total, trace
