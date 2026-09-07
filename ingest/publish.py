"""Write the root manifest to R2 (last step, atomic ordering) and purge the Cloudflare cache."""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
from pathlib import Path

import httpx

from common.config import MANIFESTS_DIR
from common.manifest import build_root_manifest
from common.storage import Storage

log = logging.getLogger("publish")


def newest_per_layer(local: dict, published: dict | None) -> dict:
    """Take each layer from whichever side carries the newer version.

    Workflows run concurrently from checkouts of different ages. A weekly run that started before
    the monthly run committed its manifests would otherwise rebuild the root from its stale copy
    and roll the GRACE layer back to the sample — which happened twice. Layer manifests are
    versioned (YYYYMMDDTHHMM), so the newer one wins regardless of who publishes last.
    """
    if not published:
        return local
    merged = dict(local)
    layers = dict(local.get("layers", {}))
    for lid, remote in (published.get("layers") or {}).items():
        mine = layers.get(lid)
        if mine is None or str(remote.get("version", "")) > str(mine.get("version", "")):
            layers[lid] = remote
    merged["layers"] = layers
    return merged


def fetch_published(base: str | None) -> dict | None:
    if not base:
        return None
    try:
        r = httpx.get(
            f"{base.rstrip('/')}/manifest.json",
            timeout=60,
            follow_redirects=True,
            headers={"User-Agent": "ava-sipi-publish/1.0"},
        )
    except httpx.HTTPError as exc:
        log.warning("could not read the published manifest: %s", exc)
        return None
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    root = newest_per_layer(
        build_root_manifest(MANIFESTS_DIR), fetch_published(os.environ.get("R2_PUBLIC_URL"))
    )
    # keep the committed layer files in step with what is published
    for lid, layer in root["layers"].items():
        p = MANIFESTS_DIR / f"{lid}.json"
        current = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        if str(layer.get("version", "")) > str(current.get("version", "")):
            p.write_text(json.dumps(layer, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            log.info("layer %s taken from the published manifest (v%s)", lid, layer["version"])
    text = json.dumps(root, ensure_ascii=False, separators=(",", ":"))
    (MANIFESTS_DIR / "manifest.json").write_text(text + "\n", encoding="utf-8")
    publish = os.environ.get("INGEST_PUBLISH", "false").lower() == "true"
    # Storage also mirrors what it uploads on disk; keep that copy out of the repo.
    storage = Storage(
        Path(tempfile.mkdtemp(prefix="ava-publish-")), os.environ.get("R2_PUBLIC_URL"), publish
    )
    if publish:
        storage.put_text(text, "manifest.json", cache_seconds=60)
        log.info("root manifest published (%d layers)", len(root["layers"]))
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    zone = os.environ.get("CLOUDFLARE_ZONE_ID")
    base = os.environ.get("R2_PUBLIC_URL")
    if publish and token and zone and base:
        urls = [f"{base.rstrip('/')}/manifest.json"]
        for layer in root["layers"].values():
            for a in layer["artifacts"]:
                u = a["url"]
                if "/latest/" in u or u.startswith(base):
                    urls.append(u if u.startswith("http") else f"{base.rstrip('/')}/{u}")
        r = httpx.post(
            f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
            headers={"Authorization": f"Bearer {token}"},
            json={"files": urls[:30]},
            timeout=30,
        )
        log.info("cache purge -> %s", r.status_code)
    return 0


if __name__ == "__main__":
    sys.exit(main())
