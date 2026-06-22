#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/** Bundle the CLI entry point into a single CJS file for pkg/nexe. */
async function main() {
  mkdirSync('dist', { recursive: true });

  // Build the CLI bundle
  await esbuild.build({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',            // CommonJS for pkg compatibility
    outfile: 'dist/bundle.cjs',
    external: [
      // Native / optional modules that should not be bundled
      'cpu-features',
      'sshcrypto',
    ],
    keepNames: true,
    logLevel: 'info',
  });

  // Also make it executable
  const { chmodSync } = await import('node:fs');
  chmodSync('dist/bundle.cjs', 0o755);

  console.log('Bundle written to dist/bundle.cjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
