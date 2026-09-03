# Design system

One theme — a night globe. Tokens live in `apps/web/src/design/tokens.css`; nothing outside them
is allowed (spec §11.5). Any new colour is added here first, with the reason.

## Colour

| Token | Hex | Role |
|---|---|---|
| `--abyss` | `#07131F` | Ocean and background. Not black — deep water. |
| `--shelf` | `#0F2233` | Land. Low contrast with the ocean. |
| `--tide` | `#3E6E8E` | Secondary text, borders, passive UI. |
| `--current` | `#7FB8D6` | Normal-flow rivers, primary UI accent. |
| `--foam` | `#EAF4F8` | Primary text, flood white. |
| `--glacier` | `#CFE6F0` | Glacier fill. |
| `--surge` | `#35E0E0` | Flood / high flow cyan. Small areas only, never backgrounds. |
| `--parch` | `#C8873A` | Drought and low flow. |
| `--parch-deep` | `#7A4A1C` | Severe drought. |
| `--cyclone` | `#9A8BD6` | Cyclone events — the single violet exception. |

Rule: cyan and ochre carry data only; the shell stays within tide/current/foam.

### Additions (with rationale)

| Token | Hex | Why |
|---|---|---|
| `SPACE` (basemap only) | `#040B13` | The globe's limb needs a value one step below the ocean, otherwise ocean and space merge and the sphere silhouette disappears. Used only as MapLibre `sky-color`; never in UI. |
| amber `#D9A45B` | legend/percentile 10–25 band and CDI "watch" | A mid-step between `parch` and `current` so the five percentile bands and three drought classes stay distinguishable; it is a derived stop on the ochre→blue OKLCH ramp, not a new hue. |
| `#9CCBE0` | glacier outline | Slightly darker `glacier` so the 0.8 px edge reads on bright ice; derived, not a new hue. |

Derived alpha values are defined once in `tokens.css` (`--glass-bg`, `--glass-border`,
`--tide-60`, `--current-20`, `--foam-70`).

## Typography

Instrument Serif for the wordmark and story titles ("Ava Sipî", the `î` preserved, letter-spacing
0). Manrope for UI and data, `font-variant-numeric: tabular-nums` everywhere. Weights 400/500/600.
Scale 12 / 14 / 16 / 20 / 28 / 44 px; line-height 1.4 body, 1.1 metric. No uppercase labels, no
eyebrows. Fonts are self-hosted (`public/fonts`, OFL, `font-display: swap`).

## Surfaces

`abyss` 60 % + backdrop blur 16 px, 1 px `tide` 30 % border, radius 6 px everywhere. No shadows —
depth comes from blur and opacity. Spacing 4 / 8 / 12 / 16 / 24 / 32 / 48. Rail 56 px closed,
200 px open. Panel 380 px.

## Motion

One orchestrated moment: the opening (12 s slow rotation, then rivers light up). After that motion
only carries data:

| What | Value |
|---|---|
| River flow | `0.35 × clamp(ratio, 0.3, 3)` waves/s; wavelength scales with width (floor ≈ 28 px) |
| Ratio > 3 | flood white with a 2 s pulse in the shader |
| Pulses | red 2 s, orange 4 s, easing `cubic-bezier(0.2, 0, 0, 1)` |
| Camera | `flyTo` 1.6 s ease-in-out; stories 2.4 s. On the globe the camera pans and zooms only — tilt and rotation live in the flat projection (see docs/DEVIATIONS.md) |
| Panel | open 240 ms, close 180 ms |
| Glacier melt | opacity 0.8 → 0.6 → 0.8 over 6 s where regional balance is negative |
| Ramps | ratio 0.3 parch-deep → 0.6 parch → 1.0 current → 1.6 surge → 3.0 foam, interpolated in OKLCH (culori in the browser, a matching implementation in `ingest/common/colors.py`) |

`prefers-reduced-motion` (or the ⌘K toggle): no opening rotation, no pulses, flow intensity 0
(static colour + width still carry the information).

## Copy

Sentence case, short verbs: "Turn on layer", "Share this view", "Go to source". Empty state:
"No live stations in this region. Turn on the rivers layer for modelled discharge." Errors state
facts and times, never apologies. Forecast watermark: "Forecast · 3 days ahead".
