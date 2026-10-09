#!/usr/bin/env bash
# Builds the docs site into public/: vendors the theme, then runs Hugo. Workers Builds'
# build command; set HUGO_PARAMS_SHOWCASECARTOKEY in the environment for the showcase's
# Carto basemap (see README.md).
#
# Hugo is pinned in .hugo-version, and has to be the extended build (the theme compiles
# its SCSS with libsass). When the hugo on PATH isn't that, as on Workers Builds, which
# installs the standard build, this downloads the pinned extended release and uses it.
set -euo pipefail

cd "$(dirname "$0")/.."

HUGO_PIN="$(tr -d '[:space:]' < .hugo-version)"
hugo_ok() { hugo version 2>/dev/null | grep -q "^hugo v${HUGO_PIN}[-+].*extended"; }

if [ -n "${IN_NIX_SHELL:-}" ]; then
  # The dev shell's hugo comes from the flake (and a downloaded generic-Linux binary
  # wouldn't run on NixOS), so keep it, but flag drift from what deploys use.
  hugo_ok || echo "warning: dev shell has $(hugo version | cut -d' ' -f2), but .hugo-version (what Workers Builds deploys with) pins v${HUGO_PIN}; update one to match" >&2
elif ! hugo_ok; then
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "error: no Hugo release for $(uname -m)" >&2; exit 1 ;;
  esac
  hugo_dir="$(mktemp -d)"
  trap 'rm -rf "$hugo_dir"' EXIT
  echo "Downloading Hugo extended v${HUGO_PIN} (linux-${arch})"
  curl -fsSL "https://github.com/gohugoio/hugo/releases/download/v${HUGO_PIN}/hugo_extended_${HUGO_PIN}_linux-${arch}.tar.gz" \
    | tar -xz -C "$hugo_dir" hugo
  export PATH="$hugo_dir:$PATH"
  hugo_ok || { echo "error: downloaded hugo isn't extended v${HUGO_PIN}: $(hugo version)" >&2; exit 1; }
fi

./scripts/fetch-theme.sh
rm -rf public
hugo
