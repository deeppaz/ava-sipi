"""NASA Earthdata Login (URS) download helper.

Protected archives (PO.DAAC, NSIDC) redirect to urs.earthdata.nasa.gov; httpx drops the
Authorization header on cross-host redirects, so we authenticate on the URS hop explicitly and
let the session cookie carry us back.
"""

from __future__ import annotations

import logging
from pathlib import Path

import httpx

log = logging.getLogger(__name__)
URS_HOST = "urs.earthdata.nasa.gov"


def earthdata_download(
    url: str, dest: Path, username: str, password: str, timeout: float = 600.0
) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        current = url
        for _ in range(10):
            auth = (username, password) if URS_HOST in current else None
            resp = client.get(current, auth=auth)
            if resp.status_code in (301, 302, 303, 307, 308):
                current = (
                    str(resp.next_request.url) if resp.next_request else resp.headers["Location"]
                )
                continue
            if resp.status_code == 401:
                raise PermissionError(f"Earthdata login rejected for {url}")
            resp.raise_for_status()
            dest.write_bytes(resp.content)
            log.info("downloaded %s (%d bytes)", dest.name, len(resp.content))
            return dest
    raise RuntimeError(f"too many redirects fetching {url}")
