# glaciers_rgi

| | |
|---|---|
| Outlines | Randolph Glacier Inventory v7.0 (RGI Consortium 2023), 19 regional shapefiles |
| Download | NSIDC `https://daacdata.apps.nsidc.org/pub/DATASETS/nsidc0770_rgi_v7/regional_files/RGI2000-v7.0-G/RGI2000-v7.0-G-<RR>_<name>.zip` — **requires a free Earthdata login** (verified: anonymous request → 401) |
| Fields | `rgi_id`, `glac_name`, `o1region`, `area_km2` |
| Mass balance | WGMS (2026) Annual mass-change estimates, `https://wgms.ch/downloads/wgms-amce-2026-02-10.zip` (53 MB, no login) → `region/<CODE>.csv` with `year, area_km2, mwe, mwe_sigma, gt, gt_sigma` (hydrological years) |
| Refresh | yearly (`ingest-monthly.yml`, gated) |
| Outputs | `glaciers/<version>/glaciers.pmtiles` (z2–z10), `glaciers.geojson` (glaciers ≥ 5 km²), `massbalance.json` (`MassBalanceFile`, last 12 years per region) |

## Region mapping

WGMS codes → RGI first-order regions: ALA 01, WNA 02, ACN 03, ACS 04, GRL 05, ISL 06, SJM 07,
SCA 08, RUA 09, ASN 10, CEU 11, CAU 12, ASC 13, ASW 14, ASE 15, TRP 16, SA1+SA2 17 (mean of the
two sub-regions), NZL 18, ANT 19. Each glacier carries its region's newest annual `mwe`
(m w.e., negative = mass loss) as `massBalanceMwe`; the UI "melts" polygon edges where it is negative.

## Sample mode

Natural Earth 50 m glaciated areas (public domain) stand in for RGI outlines; the region is
assigned from approximate region boxes, area is planar-approximated. Mass balance is real WGMS
data (regional CSVs vendored under `ingest/tests/fixtures/wgms_regions/`, ~3 KB each, with citation).

## Attribution

"Glacier outlines: RGI Consortium (2023). Randolph Glacier Inventory – A Dataset of Global
Glacier Outlines, Version 7.0. NSIDC. https://doi.org/10.5067/f6jmovy5navz (CC BY 4.0).
Mass change: WGMS (2026): Annual mass-change estimates for the world's glaciers.
https://doi.org/10.5904/wgms-amce-2026-02-10; Dussaillant et al. (2025) ESSD 17:1977–2006."

## Known issues

- No public mirror of RGI 7.0 without login was found (OGGM cluster path returned 404).
- WGMS hydrological years differ by hemisphere; the newest available year is used per region.
