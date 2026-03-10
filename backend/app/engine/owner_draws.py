from decimal import Decimal


def calculate_owner_draws(
    distributions: Decimal,
    tax_savings: Decimal,
) -> tuple[Decimal, dict]:
    """
    Owner draws model.
    Both inputs are in cents.
    Returns (total_draws_cents, trace_dict).
    """
    total = distributions + tax_savings

    trace = {
        "value": int(total),
        "formula": "distributions + tax_savings",
        "components": [
            {
                "label": "Owner distributions",
                "value": int(distributions),
                "source": "forecast_driver",
            },
            {
                "label": "Tax savings",
                "value": int(tax_savings),
                "source": "forecast_driver",
            },
        ],
    }
    return total, trace
