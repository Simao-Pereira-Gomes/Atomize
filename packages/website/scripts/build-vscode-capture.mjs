// Builds a documentation-capture copy of the VS Code extension whose Connection Profiles resolve to
// atomize-core's Mock platform, so screenshots can show the real Generate flow without credentials.
// Run `bun run --cwd packages/vscode-extension build` first; the output is never published.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extension = fileURLToPath(new URL('../../vscode-extension/', import.meta.url));
const shim = fileURLToPath(new URL('./vscode-capture/credential-resolver.ts', import.meta.url));
const output = process.env.ATOMIZE_VSCODE_CAPTURE_BUILD ?? '/tmp/atomize-vscode-docs/extension';
const { build } = createRequire(join(extension, 'package.json'))('esbuild');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of ['package.json', 'LICENSE', 'README.md', 'dist', 'icons', 'images', 'schemas', 'snippets', 'syntaxes']) {
  cpSync(join(extension, entry), join(output, entry), { recursive: true });
}

const captureResolver = {
  name: 'atomize-capture-credential-resolver',
  setup(builder) {
    builder.onResolve({ filter: /credential-resolver(\.js)?$/ }, args => {
      if (!args.importer.startsWith(join(extension, 'src'))) return undefined;
      return { path: shim, namespace: 'atomize-capture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'atomize-capture' }, () => ({
      contents: readFileSync(shim, 'utf8'),
      loader: 'ts',
      // Resolve the shim's imports as if it lived beside the module it replaces.
      resolveDir: join(extension, 'src/profiles'),
    }));
  },
};

await build({
  entryPoints: [join(extension, 'src/extension.ts')],
  absWorkingDir: extension,
  bundle: true,
  outfile: join(output, 'dist/extension.js'),
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode', 'node:*'],
  sourcemap: true,
  loader: { '.css': 'text' },
  logOverride: { 'empty-import-meta': 'silent' },
  plugins: [captureResolver],
});
console.log(`Built the capture-only extension at ${output}; its Connection Profiles use the Mock platform.`);
