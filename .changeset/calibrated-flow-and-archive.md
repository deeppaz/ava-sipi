---
"@ava-sipi/web": minor
---

Flow ratios you can trust, and the GRACE archive on the slider.

- River discharge is sampled on the GloFAS channel cell (probed once, remembered), so the
  Mississippi, Yangtze and Volga read their real flow instead of a floodplain cell's trickle.
- Dragging the timeline back now loads the matching monthly groundwater anomaly (2002 → today).
- Manifests are committed by regeneration; a transient upstream failure no longer marks a run
  failed or rolls a layer back to sample data.
- USGS percentile tables are built in bounded, resumable slices; one unavailable RGI region or a
  failing tail page of the reservoir list no longer discards the rest.
