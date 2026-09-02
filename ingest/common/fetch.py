"""HTTP fetching with retry, ETag cache and a simple per-host rate limiter."""

from __future__ import annotations

import hashlib
import json
import logging
import random
import threading
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

USER_AGENT = "ava-sipi-ingest/0.1 (+https://github.com/ava-sipi/ava-sipi)"
RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    pass


class RateLimiter:
    """Token-bucket-ish limiter: at most `per_second` requests per host."""

    def __init__(self, per_second: float = 5.0) -> None:
        self.interval = 1.0 / per_second if per_second > 0 else 0.0
        self._last: dict[str, float] = defaultdict(float)
        self._lock = threading.Lock()

    def wait(self, host: str) -> None:
        if self.interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            delta = now - self._last[host]
            if delta < self.interval:
                time.sleep(self.interval - delta)
            self._last[host] = time.monotonic()


class Fetcher:
    """Thin httpx wrapper: retries with exponential backoff, ETag revalidation, optional disk cache.

    `cache_dir` stores `{sha(url)}.body` + `.meta` so repeated runs (and tests) skip downloads.
    """

    def __init__(
        self,
        cache_dir: Path | None = None,
        timeout: float = 60.0,
        retries: int = 4,
        per_second: float = 5.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.cache_dir = cache_dir
        self.retries = retries
        self.limiter = RateLimiter(per_second)
        base_headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
        if headers:
            base_headers.update(headers)
        self.client = httpx.Client(timeout=timeout, headers=base_headers, follow_redirects=True)

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> Fetcher:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # -- cache helpers -----------------------------------------------------------------
    def _cache_paths(self, url: str) -> tuple[Path, Path] | None:
        if not self.cache_dir:
            return None
        key = hashlib.sha256(url.encode()).hexdigest()[:32]
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        return self.cache_dir / f"{key}.body", self.cache_dir / f"{key}.meta"

    def get_bytes(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> bytes:
        req = self.client.build_request("GET", url, params=params, headers=headers)
        full_url = str(req.url)
        paths = self._cache_paths(full_url) if use_cache else None
        etag: str | None = None
        if paths and paths[0].exists() and paths[1].exists():
            try:
                etag = json.loads(paths[1].read_text(encoding="utf-8")).get("etag")
            except json.JSONDecodeError:
                etag = None
            if etag:
                req.headers["If-None-Match"] = etag

        host = req.url.host
        last_exc: Exception | None = None
        for attempt in range(self.retries + 1):
            self.limiter.wait(host)
            try:
                resp = self.client.send(req)
            except httpx.HTTPError as exc:  # network layer
                last_exc = exc
                self._sleep(attempt)
                continue
            if resp.status_code == 304 and paths:
                log.debug("304 cache hit %s", full_url)
                return paths[0].read_bytes()
            if resp.status_code in RETRY_STATUS and attempt < self.retries:
                retry_after = resp.headers.get("Retry-After")
                self._sleep(
                    attempt, float(retry_after) if retry_after and retry_after.isdigit() else None
                )
                continue
            if resp.status_code >= 400:
                raise FetchError(f"GET {full_url} -> {resp.status_code}: {resp.text[:200]}")
            body = resp.content
            if paths:
                paths[0].write_bytes(body)
                paths[1].write_text(
                    json.dumps({"etag": resp.headers.get("ETag"), "url": full_url}),
                    encoding="utf-8",
                )
            return body
        raise FetchError(f"GET {full_url} failed after {self.retries + 1} attempts: {last_exc}")

    def get_json(self, url: str, params: dict[str, Any] | None = None, **kw: Any) -> Any:
        return json.loads(self.get_bytes(url, params=params, **kw).decode("utf-8"))

    def get_text(self, url: str, params: dict[str, Any] | None = None, **kw: Any) -> str:
        return self.get_bytes(url, params=params, **kw).decode("utf-8")

    def post_json(self, url: str, body: Any, headers: dict[str, str] | None = None) -> Any:
        last_exc: Exception | None = None
        for attempt in range(self.retries + 1):
            self.limiter.wait(httpx.URL(url).host)
            try:
                resp = self.client.post(url, json=body, headers=headers)
            except httpx.HTTPError as exc:
                last_exc = exc
                self._sleep(attempt)
                continue
            if resp.status_code in RETRY_STATUS and attempt < self.retries:
                self._sleep(attempt)
                continue
            if resp.status_code >= 400:
                raise FetchError(f"POST {url} -> {resp.status_code}: {resp.text[:200]}")
            return resp.json()
        raise FetchError(f"POST {url} failed: {last_exc}")

    def last_modified(self, url: str) -> str | None:
        """HTTP Last-Modified header via HEAD (None when absent)."""
        try:
            resp = self.client.head(url)
        except httpx.HTTPError:
            return None
        return resp.headers.get("Last-Modified")

    def download(self, url: str, dest: Path, params: dict[str, Any] | None = None) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(self.get_bytes(url, params=params))
        return dest

    @staticmethod
    def _sleep(attempt: int, retry_after: float | None = None) -> None:
        delay = (
            retry_after if retry_after is not None else min(30.0, (2**attempt) + random.random())
        )
        time.sleep(delay)
