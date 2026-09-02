# Stories

Four guided stories (spec §5.5). Steps live in `apps/web/src/stories/index.ts`; texts in the i18n
dictionaries (`stories.<id>.step.<n>`). Each step sets camera, layers, time and optionally a
selection. Facts below were checked against the cited sources; numbers in the text are rounded.

## euphrates-tigris — Euphrates and Tigris

1. Sources in eastern Anatolia (Murat/Karasu; Tigris near Lake Hazar), ~100 km apart. Layers: rivers, gauges.
2. Keban (1974), Karakaya (1987), Atatürk (1992) — combined storage several years of mean flow (DSİ). Layers: rivers, reservoirs; selects the Atatürk reservoir from GWW.
3. Downstream flow versus long-term mean: today's GloFAS ratio. Layers: rivers, events.
4. GRACE 2003–2009: ~144 km³ freshwater loss in the Tigris–Euphrates basin (Voss et al. 2013, *Water Resources Research*). Layer: groundwater.
5. Shatt al-Arab and saltwater intrusion (Basra summers). Layers: rivers, gauges, events.

## aral — The Aral Sea

1. Fourth-largest lake in 1960; irrigation diversions of Amu Darya / Syr Darya (Micklin 2007).
2. GRACE anomaly since 2002 — time slider at 2003-01-01. Layer: groundwater.
3. Kok-Aral dike (2005) stabilised the North Aral; the eastern basin dried in 2014 (NASA Earth Observatory).
4. Toktogul reservoir upstream on the Naryn/Syr Darya. Layers: rivers, reservoirs; selects Toktogul.

## colorado — The Colorado

1. ~40 million people; 1922 Colorado River Compact based on wet-period flows (USBR).
2. Lake Mead surface-area series (GWW) — 2000s megadrought drawdown. Selects Mead.
3. Lake Powell fill proxy. Selects Powell.
4. Copernicus CDI across the basin. Layers: rivers, drought.
5. Delta — river rarely reaches the Gulf of California.

## alps — Alpine glaciers

1. Central Europe lost roughly a third of glacier volume since 2000 (Hugonnet et al. 2021; WGMS). Layers: glaciers, rivers.
2. Aletsch retreat > 3 km since 1870 (VAW/ETH glacier monitoring). Camera on Aletsch.
3. Melt animation: polygon edges breathe where regional mass balance is negative.
4. Late-summer contribution to Rhône, Rhine, Po (Huss 2011). Layers: glaciers, rivers, gauges.

Each story is shareable: `?story=euphrates-tigris&step=3`.
