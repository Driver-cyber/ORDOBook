from decimal import Decimal


def calculate_payroll(
    cost_per_run: Decimal,
    runs_this_month: int,
    one_off: Decimal,
) -> tuple[Decimal, dict]:
    """
    Pay run model.
    cost_per_run and one_off are in cents.
    Returns (total_payroll_cents, trace_dict).
    """
    run_total = cost_per_run * Decimal(runs_this_month)
    total = run_total + one_off

    trace = {
        "value": int(total),
        "formula": "(cost_per_run × runs) + one_off",
        "components": [
            {
                "label": f"Pay runs ({runs_this_month} × ${cost_per_run / 100:,.0f})",
                "value": int(run_total),
                "source": "forecast_driver",
            },
            {
                "label": "One-off / irregular",
                "value": int(one_off),
                "source": "forecast_driver",
            },
        ],
    }
    return total, trace
