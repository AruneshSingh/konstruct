#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Point to the tsup-bundled output.  Falls back to tsx dev shim if dist/ doesn't exist yet.
const distEntry = resolve(__dirname, '..', 'dist', 'index.js');

try {
  // Dynamic import so the path is resolved at runtime
  await import(distEntry);
} catch {
  // dist/ not built yet — fall back to tsx for development
  const { execFileSync } = await import('node:child_process');
  const projectRoot = resolve(__dirname, '..');
  const tsx = resolve(projectRoot, 'node_modules', '.bin', 'tsx');
  const entrypoint = resolve(projectRoot, 'src', 'cli', 'index.ts');
  execFileSync(tsx, [entrypoint, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
}
