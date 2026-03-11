from decimal import Decimal


def calculate_overhead(
    other_overhead_cents: int,
    month: int,
) -> tuple[Decimal, dict]:
    """
    Single catch-all overhead amount for the month (rent, utilities, etc.).
    Value is in cents.
    Returns (total_overhead_cents, trace_dict).
    """
    total = Decimal(other_overhead_cents)
    trace = {
        "value": int(total),
        "formula": "manual entry — other overhead",
        "components": [
            {
                "label": "Other Overhead",
                "value": int(total),
                "source": "forecast_driver",
            }
        ],
    }
    return total, trace
