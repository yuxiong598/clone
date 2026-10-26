#!/usr/bin/env bash
# Verification scratch space only; source edits remain in the desktop assignment.
set -euo pipefail
project=$(cd "$(dirname "$0")/.." && pwd)
deps=/home/yangruihang/blockchain-course/my-first-dapp
scratch=$(mktemp -d /tmp/blockchain-assignment-check.XXXXXX)
printf 'Verification scratch: %s\n' "$scratch"
tar -C "$project" --exclude=node_modules --exclude=.git --exclude=.next --exclude=cache --exclude=artifacts --exclude=typechain-types --exclude=.yarn --exclude=.env --exclude='.env.local' -cf - packages scripts | tar -C "$scratch" -xf -
cp "$project/package.json" "$scratch/package.json"
ln -s "$deps/node_modules" "$scratch/node_modules"
ln -s "$deps/packages/nextjs/node_modules" "$scratch/packages/nextjs/node_modules"
ln -s "$deps/packages/hardhat/node_modules" "$scratch/packages/hardhat/node_modules"
cd "$scratch/packages/nextjs"
node node_modules/typescript/bin/tsc --noEmit --incremental false
cd "$scratch/packages/hardhat"
node node_modules/hardhat/internal/cli/cli.js test --network hardhat
printf 'Source typecheck and contract tests passed. Scratch: %s\n' "$scratch"
