"""Design-token colour ramps used when rasters are coloured at ingest time (spec §6.4).

Interpolation is done in OKLCH via a tiny sRGB<->OKLab implementation to avoid grey mid-tones.
"""

from __future__ import annotations

import math

TOKENS = {
    "abyss": "#07131F",
    "shelf": "#0F2233",
    "tide": "#3E6E8E",
    "current": "#7FB8D6",
    "foam": "#EAF4F8",
    "glacier": "#CFE6F0",
    "surge": "#35E0E0",
    "parch": "#C8873A",
    "parch-deep": "#7A4A1C",
    "cyclone": "#9A8BD6",
}

RGB = tuple[float, float, float]


def hex_to_rgb(h: str) -> RGB:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c: float) -> float:
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def rgb_to_oklab(rgb: RGB) -> tuple[float, float, float]:
    r, g, b = (_lin(c) for c in rgb)
    l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l_, m_, s_))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklab_to_rgb(lab: tuple[float, float, float]) -> RGB:
    ll, a, b = lab
    l_ = (ll + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (ll - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (ll - 0.0894841775 * a - 1.2914855480 * b) ** 3
    r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
    g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
    bb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_
    return (_gam(r), _gam(g), _gam(bb))


def _to_oklch(lab: tuple[float, float, float]) -> tuple[float, float, float]:
    ll, a, b = lab
    return ll, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def _from_oklch(lch: tuple[float, float, float]) -> tuple[float, float, float]:
    ll, c, h = lch
    return ll, c * math.cos(math.radians(h)), c * math.sin(math.radians(h))


def mix_oklch(c1: str, c2: str, t: float) -> RGB:
    a = _to_oklch(rgb_to_oklab(hex_to_rgb(c1)))
    b = _to_oklch(rgb_to_oklab(hex_to_rgb(c2)))
    dh = ((b[2] - a[2] + 540) % 360) - 180  # shortest hue arc
    if a[1] < 1e-4:
        h = b[2]
    elif b[1] < 1e-4:
        h = a[2]
    else:
        h = a[2] + dh * t
    lch = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h)
    return oklab_to_rgb(_from_oklch(lch))


class Ramp:
    """Piecewise OKLCH ramp over (value, hex) stops; alpha per stop optional."""

    def __init__(self, stops: list[tuple[float, str]], alphas: list[float] | None = None) -> None:
        self.stops = sorted(stops)
        self.alphas = alphas or [1.0] * len(self.stops)

    def rgba(self, v: float) -> tuple[int, int, int, int]:
        s = self.stops
        if v <= s[0][0]:
            r, g, b = hex_to_rgb(s[0][1])
            a = self.alphas[0]
        elif v >= s[-1][0]:
            r, g, b = hex_to_rgb(s[-1][1])
            a = self.alphas[-1]
        else:
            for i in range(len(s) - 1):
                if s[i][0] <= v <= s[i + 1][0]:
                    span = s[i + 1][0] - s[i][0]
                    t = 0.0 if span == 0 else (v - s[i][0]) / span
                    r, g, b = mix_oklch(s[i][1], s[i + 1][1], t)
                    a = self.alphas[i] + (self.alphas[i + 1] - self.alphas[i]) * t
                    break
            else:  # pragma: no cover
                r, g, b = hex_to_rgb(s[-1][1])
                a = 1.0
        return int(round(r * 255)), int(round(g * 255)), int(round(b * 255)), int(round(a * 255))


# Spec §6.4 river ratio ramp
RIVER_RAMP = Ramp(
    [
        (0.3, TOKENS["parch-deep"]),
        (0.6, TOKENS["parch"]),
        (1.0, TOKENS["current"]),
        (1.6, TOKENS["surge"]),
        (3.0, TOKENS["foam"]),
    ]
)

# Groundwater anomaly (cm w.e.): −20 deep ochre → 0 transparent → +20 cyan
GROUNDWATER_RAMP = Ramp(
    [
        (-20, TOKENS["parch-deep"]),
        (-10, TOKENS["parch"]),
        (0, TOKENS["current"]),
        (10, TOKENS["current"]),
        (20, TOKENS["surge"]),
    ],
    alphas=[1.0, 0.9, 0.0, 0.9, 1.0],
)

# Percentile (0-100) for GRACE-DA indicators: dry ochre → neutral transparent → wet cyan
PERCENTILE_RAMP = Ramp(
    [
        (0, TOKENS["parch-deep"]),
        (20, TOKENS["parch"]),
        (50, TOKENS["current"]),
        (80, TOKENS["current"]),
        (100, TOKENS["surge"]),
    ],
    alphas=[1.0, 0.85, 0.0, 0.85, 1.0],
)

# SPI-3 continuous ramp: −3 severe drought → 0 transparent → +3 wet
SPI_RAMP = Ramp(
    [
        (-3, TOKENS["parch-deep"]),
        (-1, TOKENS["parch"]),
        (0, TOKENS["current"]),
        (1, TOKENS["current"]),
        (3, TOKENS["surge"]),
    ],
    alphas=[1.0, 0.85, 0.0, 0.85, 1.0],
)

# Combined Drought Indicator classes (0 none, 1 watch, 2 warning, 3 alert)
CDI_COLORS = {
    0: (0, 0, 0, 0),
    1: (0xD9, 0xA4, 0x5B, 200),
    2: (0xC8, 0x87, 0x3A, 220),
    3: (0x7A, 0x4A, 0x1C, 240),
}
