from decimal import Decimal


def calculate_revenue(
    small_count: int,
    small_avg: Decimal,
    medium_count: int,
    medium_avg: Decimal,
    large_count: int,
    large_avg: Decimal,
) -> tuple[Decimal, dict]:
    """
    3-tier job mix revenue model.
    All avg values are in cents.
    Returns (total_revenue_cents, trace_dict).
    """
    small_total = Decimal(small_count) * small_avg
    medium_total = Decimal(medium_count) * medium_avg
    large_total = Decimal(large_count) * large_avg
    total = small_total + medium_total + large_total

    trace = {
        "value": int(total),
        "formula": "small_jobs + medium_jobs + large_jobs",
        "components": [
            {
                "label": f"Small ({small_count} × ${small_avg / 100:,.0f})",
                "value": int(small_total),
                "source": "forecast_driver",
            },
            {
                "label": f"Medium ({medium_count} × ${medium_avg / 100:,.0f})",
                "value": int(medium_total),
                "source": "forecast_driver",
            },
            {
                "label": f"Large ({large_count} × ${large_avg / 100:,.0f})",
                "value": int(large_total),
                "source": "forecast_driver",
            },
        ],
    }
    return total, trace
