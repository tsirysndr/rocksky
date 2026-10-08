#!/usr/bin/env bash
# Regenerate the Rust bindings in src/{builder_types.rs,app_rocksky*,app_bsky*,
# com_atproto*,community_lexicon*} of the rocksky-sdk crate from the Rocksky lexicon JSON. Requires
# the jacquard codegen binary:
#   cargo install jacquard-lexgen        # provides `jacquard-codegen`
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"                 # crates/rocksky-sdk
lexicons="$here/../../apps/api/lexicons"                 # repo-root/apps/api/lexicons
out="$(mktemp -d)"
jacquard-codegen -i "$lexicons" -o "$out"
# The generated app.rocksky.* code references crate::com_atproto and
# crate::app_bsky (strongRef, profile) and crate::community_lexicon (the
# calendar event an app.rocksky.event.music annotates), so vendor all four
# namespace modules plus the shared builder helpers.
for ns in app_rocksky app_bsky com_atproto community_lexicon; do
  cp "$out/$ns.rs" "$here/src/$ns.rs"
  rm -rf "$here/src/$ns" && cp -r "$out/$ns" "$here/src/$ns"
done
cp "$out/builder_types.rs" "$here/src/builder_types.rs"
echo "regenerated lexicon bindings in $here/src"
