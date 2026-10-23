import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
await build({
  entryPoints: ['server/index.ts'], outfile: 'dist/server.js', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external',
  plugins: [{ name: 'exclude-local-codex', setup(build) {
    build.onResolve({ filter: /^\.\/codex$/ }, () => ({ path: resolve('server/generation/codex-disabled.ts') }));
  } }],
});
const output = await readFile('dist/server.js', 'utf8');
if (output.includes('node:child_process') || output.includes('--output-schema')) throw new Error('Local CLI adapter leaked into the production build.');
console.log('Production server built; local Codex process adapter excluded.');
