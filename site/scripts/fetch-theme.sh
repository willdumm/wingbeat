#!/usr/bin/env bash
# Vendors the hugo-book theme into themes/hugo-book at a pinned tag.
# Not committed (see .gitignore) — run this before building/serving locally,
# and as a CI build step before deploying.
set -euo pipefail

THEME_REPO="https://github.com/alex-shpak/hugo-book.git"
THEME_REF="v13"

cd "$(dirname "$0")/.."
rm -rf themes/hugo-book
git clone --depth 1 --branch "$THEME_REF" "$THEME_REPO" themes/hugo-book
rm -rf themes/hugo-book/.git themes/hugo-book/.github
