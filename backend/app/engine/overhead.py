from decimal import Decimal


def calculate_overhead(
    hard_key_cents: int | None,
    detail: dict | None,
) -> tuple[Decimal, dict]:
    """Overhead for one forecast month, and the trace explaining which rule applied.

    Resolution order — PRESENCE, not truthiness, so a hard-keyed $0 is honoured:

      1. `hard_key_cents` is not None  → the advisor typed a figure into the
         Forecast grid for this month. It wins, and the schedule underneath is
         left intact so clearing the cell restores it.
      2. `detail` is non-empty         → the sum of the per-account schedule the
         advisor built on the Overhead detail screen.
      3. otherwise                     → 0.

    The trace names the rule and lists the accounts, so every displayed figure
    can be traced back to its inputs (Module 3a).
    """
    if hard_key_cents is not None:
        total = Decimal(hard_key_cents)
        components = [{
            "label": "Other Overhead (typed)",
            "value": int(total),
            "source": "forecast_driver",
        }]
        if detail:
            # Worth surfacing: a schedule exists but is being overridden.
            components.append({
                "label": f"Schedule underneath ({len(detail)} accounts) — overridden",
                "value": int(sum(int(v or 0) for v in detail.values())),
                "source": "forecast_detail",
            })
        return total, {
            "value": int(total),
            "formula": "manual entry — overrides the overhead schedule",
            "components": components,
        }

    if detail:
        total = Decimal(sum(int(v or 0) for v in detail.values()))
        return total, {
            "value": int(total),
            "formula": f"sum of {len(detail)} overhead accounts",
            "components": [
                {"label": name, "value": int(amount or 0), "source": "forecast_detail"}
                for name, amount in detail.items()
            ],
        }

    return Decimal(0), {
        "value": 0,
        "formula": "no overhead entered for this month",
        "components": [],
    }
