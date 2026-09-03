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


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    root = build_root_manifest(MANIFESTS_DIR)
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
