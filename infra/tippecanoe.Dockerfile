# Tippecanoe for machines without a native build (Windows, or any image that lacks it).
# Build once:  docker build -f infra/tippecanoe.Dockerfile -t ava-sipi/tippecanoe .
# Then point the ingest at it:  TIPPECANOE_DOCKER_IMAGE=ava-sipi/tippecanoe
#
# The release tarball is used rather than `git clone`, which asks for credentials inside the
# sandboxed build network and fails.
FROM debian:bookworm-slim AS build
ARG TIPPECANOE_VERSION=2.79.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates curl libsqlite3-dev zlib1g-dev \
 && mkdir -p /src \
 && curl -sSL "https://codeload.github.com/felt/tippecanoe/tar.gz/refs/tags/${TIPPECANOE_VERSION}" \
    | tar xz -C /src --strip-components=1 \
 && make -C /src -j"$(nproc)" \
 && make -C /src install

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libsqlite3-0 zlib1g \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/tippecanoe* /usr/local/bin/
WORKDIR /work
ENTRYPOINT []
