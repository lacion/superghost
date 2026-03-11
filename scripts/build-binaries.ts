#!/usr/bin/env bun
import { $ } from "bun";

const ENTRY = "src/cli.ts";
const OUTDIR = "dist";
const TARGETS = [
  { target: "bun-darwin-arm64", outfile: "superghost-darwin-arm64" },
  { target: "bun-darwin-x64", outfile: "superghost-darwin-x64" },
  { target: "bun-linux-arm64", outfile: "superghost-linux-arm64" },
  { target: "bun-linux-x64", outfile: "superghost-linux-x64" },
];

await $`mkdir -p ${OUTDIR}`;

for (const { target, outfile } of TARGETS) {
  console.log(`Building ${outfile} (target: ${target})...`);
  await $`bun build --compile --target=${target} --minify --bytecode --sourcemap ${ENTRY} --outfile ${OUTDIR}/${outfile}`;
}

console.log(`\nAll binaries built in ${OUTDIR}/`);
await $`ls -lh ${OUTDIR}/superghost-*`;
