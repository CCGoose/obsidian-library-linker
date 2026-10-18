#!/usr/bin/env bash
# Builds the plugin and installs it into every vault that uses this fork.
#
# Obsidian loads a plugin from inside the vault, and each vault keeps its own copy,
# so both have to be updated together or they drift apart. Run `pnpm install:vaults`.
set -euo pipefail

VAULTS=(
  "$HOME/My Drive/JW/personal_study"
  "$HOME/My Drive/JW/Life_and_Ministry"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PLUGIN_ID="$(node -p "require('./manifest.json').id")"
VERSION="$(node -p "require('./manifest.json').version")"

echo "Building $PLUGIN_ID $VERSION"
pnpm build

missing=0
for vault in "${VAULTS[@]}"; do
  if [[ ! -d "$vault/.obsidian" ]]; then
    echo "  SKIP  $vault (not an Obsidian vault)"
    missing=1
    continue
  fi

  target="$vault/.obsidian/plugins/$PLUGIN_ID"
  mkdir -p "$target"
  cp main.js manifest.json styles.css "$target/"
  echo "  OK    $target"
done

echo
echo "Reload the plugin in each vault (Settings → Community plugins, toggle off and on)."
exit "$missing"
