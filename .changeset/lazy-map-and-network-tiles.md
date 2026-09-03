---
"@ava-sipi/web": minor
"@ava-sipi/schema": patch
---

First paint without JavaScript and a full river network.

- `index.html` paints a static globe skeleton; the MapLibre module loads on idle after the shell
  renders, panels on first use, zod behind a dynamic import. Initial JS 412 KB → 108 KB gzip,
  mobile FCP 3.5 s → 1.7 s.
- The full HydroRIVERS network (Strahler ≥ 3 at zoom ≥ 7) is drawn from vector tiles and coloured
  by today's flow ratio.
- Layer artifacts load once the map exists; the map container keeps its size whatever order the
  lazy stylesheets arrive in (regression covered by a smoke test).
- `@ava-sipi/schema/constants` exposes the layer ids without pulling in the validators.
