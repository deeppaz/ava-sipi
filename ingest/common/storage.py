"""Artifact storage: local out dir always; Cloudflare R2 (S3 compatible) when publishing.

Artifact key layout: `<layer>/<YYYYMMDDTHHMM>/<file>` plus a `<layer>/latest/<file>` alias so
clients can pin a version (time slider) or follow the newest one.
"""

from __future__ import annotations

import logging
import mimetypes
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

mimetypes.add_type("application/vnd.pmtiles", ".pmtiles")
mimetypes.add_type("application/vnd.apache.parquet", ".parquet")
mimetypes.add_type("application/geo+json", ".geojson")


@dataclass(slots=True)
class StoredArtifact:
    key: str
    url: str
    bytes: int
    path: Path


class Storage:
    def __init__(
        self, out_dir: Path, public_base_url: str | None = None, publish: bool = False
    ) -> None:
        self.out_dir = out_dir
        self.public_base_url = (public_base_url or "").rstrip("/") or None
        self.publish = publish
        self._s3 = None
        self._bucket = os.environ.get("R2_BUCKET")

    # -- R2 client ---------------------------------------------------------------------
    def _client(self):
        if self._s3 is None:
            import boto3  # imported lazily so tests never need it

            account = os.environ["R2_ACCOUNT_ID"]
            self._s3 = boto3.client(
                "s3",
                endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                region_name="auto",
            )
        return self._s3

    def url_for(self, key: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        # Relative to the root manifest location (data/ in the repo / site root in deploys).
        return key

    def put(
        self, local: Path, layer: str, version: str, name: str, cache_seconds: int = 300
    ) -> StoredArtifact:
        """Copy `local` to `<out>/<layer>/<version>/<name>` (+ latest alias) and upload if publishing."""
        key = f"{layer}/{version}/{name}"
        latest_key = f"{layer}/latest/{name}"
        for k in (key, latest_key):
            dest = self.out_dir / k
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.resolve() != local.resolve():
                shutil.copyfile(local, dest)
        size = local.stat().st_size
        if self.publish:
            if not self._bucket:
                raise RuntimeError("R2_BUCKET is required when publishing")
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            client = self._client()
            for k, max_age in ((key, 31536000), (latest_key, cache_seconds)):
                log.info("upload %s (%d bytes)", k, size)
                client.upload_file(
                    str(local),
                    self._bucket,
                    k,
                    ExtraArgs={"ContentType": ctype, "CacheControl": f"public, max-age={max_age}"},
                )
        return StoredArtifact(key=key, url=self.url_for(key), bytes=size, path=self.out_dir / key)

    def put_text(self, text: str, key: str, cache_seconds: int = 60) -> None:
        dest = self.out_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        if self.publish:
            if not self._bucket:
                raise RuntimeError("R2_BUCKET is required when publishing")
            self._client().put_object(
                Bucket=self._bucket,
                Key=key,
                Body=text.encode("utf-8"),
                ContentType=mimetypes.guess_type(key)[0] or "application/json",
                CacheControl=f"public, max-age={cache_seconds}",
            )
