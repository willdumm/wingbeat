#!/usr/bin/env bash
# Builds the docs site into public/: vendors the theme, then runs Hugo. Workers Builds'
# build command; set HUGO_PARAMS_SHOWCASECARTOKEY in the environment for the showcase's
# Carto basemap (see README.md).
set -euo pipefail

cd "$(dirname "$0")/.."
./scripts/fetch-theme.sh
rm -rf public
hugo
