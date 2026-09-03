"""Ingest CLI.

python cli.py list
python cli.py run events_gdacs [--out data] [--publish] [--sample]
python cli.py root [--manifests data/manifests]
python cli.py samples   (see make_samples.py)
"""

from __future__ import annotations

import argparse
import logging
import sys
import traceback
from pathlib import Path

from common.config import DATA_DIR, MANIFESTS_DIR, PipelineConfig
from common.manifest import (
    mark_failure,
    read_layer_manifest,
    write_layer_manifest,
    write_root_manifest,
)
from pipelines import LAYER_OF, PIPELINES, get_pipeline, owned_notes

log = logging.getLogger("ingest")


def cmd_run(args: argparse.Namespace) -> int:
    out_dir = Path(args.out).resolve()
    manifests_dir = Path(args.manifests).resolve()
    exit_code = 0
    for name in args.pipelines:
        layer = LAYER_OF[name]
        previous = read_layer_manifest(layer, manifests_dir) or {}
        cfg = PipelineConfig.from_env(
            out_dir,
            publish=bool(args.publish),
            sample=bool(args.sample),
            prior_failures=int(previous.get("failures", 0)),
            previous_versions=list(previous.get("versions", [])),
        )
        log.info("== %s -> %s (version %s)", name, layer, cfg.version)
        try:
            manifest = get_pipeline(name)(cfg)
            # merge artifacts from sibling pipelines writing the same layer (e.g. discharge -> rivers)
            if previous and previous.get("artifacts"):
                mine = {a.name for a in manifest.artifacts}
                kept = False
                for a in previous["artifacts"]:
                    if a.get("name") not in mine:
                        kept = True
                        from common.manifest import ArtifactRef

                        manifest.artifacts.append(ArtifactRef(**a))
                if kept:
                    # Carry the sibling pipelines' notes, but never a stale one this run owns:
                    # tiles built now must not inherit "no tiles were built".
                    mine_notes = owned_notes(name)
                    for n in previous.get("notes", []):
                        if n not in manifest.notes and n not in mine_notes:
                            manifest.notes.append(n)
            path = write_layer_manifest(manifest, manifests_dir)
            log.info("manifest written %s", path)
        except Exception:
            failures = mark_failure(layer, manifests_dir)
            log.error(
                "pipeline %s failed (consecutive failures: %d)\n%s",
                name,
                failures,
                traceback.format_exc(),
            )
            exit_code = 1
    write_root_manifest(manifests_dir)
    return exit_code


def cmd_root(args: argparse.Namespace) -> int:
    path = write_root_manifest(Path(args.manifests).resolve())
    print(path)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    parser = argparse.ArgumentParser(prog="ingest")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    run_p = sub.add_parser("run")
    run_p.add_argument("pipelines", nargs="+", choices=sorted(PIPELINES))
    run_p.add_argument("--out", default=str(DATA_DIR))
    run_p.add_argument("--manifests", default=str(MANIFESTS_DIR))
    run_p.add_argument("--publish", action="store_true")
    run_p.add_argument("--sample", action="store_true")
    root_p = sub.add_parser("root")
    root_p.add_argument("--manifests", default=str(MANIFESTS_DIR))
    samples_p = sub.add_parser("samples")
    samples_p.add_argument("pipelines", nargs="*")
    args = parser.parse_args(argv)

    if args.cmd == "list":
        for k, v in PIPELINES.items():
            print(f"{k:22s} -> layer {LAYER_OF[k]:12s} ({v})")
        return 0
    if args.cmd == "run":
        return cmd_run(args)
    if args.cmd == "root":
        return cmd_root(args)
    if args.cmd == "samples":
        from make_samples import main as samples_main

        return samples_main(args.pipelines or None)
    return 2


if __name__ == "__main__":
    sys.exit(main())
