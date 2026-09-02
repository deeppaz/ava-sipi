"""Unit conversion happens only in ingest (spec §2.1). Internal standard is SI."""

from collections.abc import Sequence

CFS_TO_M3S = 0.028316846592
KCFS_TO_M3S = 28.316846592
FT_TO_M = 0.3048
SQMI_TO_KM2 = 2.589988110336


def cfs_to_m3s(v: float) -> float:
    return v * CFS_TO_M3S


def kcfs_to_m3s(v: float) -> float:
    return v * KCFS_TO_M3S


def ft_to_m(v: float) -> float:
    return v * FT_TO_M


def percentile_rank(value: float, sorted_values: Sequence[float]) -> float:
    """Percentile rank of `value` within `sorted_values` (0-100, linear within ties)."""
    n = len(sorted_values)
    if n == 0:
        raise ValueError("empty distribution")
    below = 0
    equal = 0
    for v in sorted_values:
        if v < value:
            below += 1
        elif v == value:
            equal += 1
        else:
            break
    return 100.0 * (below + 0.5 * equal) / n


def percentile_from_quantiles(value: float, quantiles: Sequence[float]) -> float:
    """Interpolate a percentile from [p5, p10, p25, p50, p75, p90, p95] breakpoints."""
    probs = [5, 10, 25, 50, 75, 90, 95]
    if len(quantiles) != 7:
        raise ValueError("expected 7 quantiles")
    if value <= quantiles[0]:
        return max(0.0, 5.0 * (value / quantiles[0])) if quantiles[0] > 0 else 0.0
    if value >= quantiles[-1]:
        return 95.0 + min(5.0, 5.0 * ((value - quantiles[-1]) / max(quantiles[-1], 1e-9)))
    for i in range(6):
        lo, hi = quantiles[i], quantiles[i + 1]
        if lo <= value <= hi:
            if hi == lo:
                return float(probs[i + 1])
            return probs[i] + (probs[i + 1] - probs[i]) * (value - lo) / (hi - lo)
    return 50.0
