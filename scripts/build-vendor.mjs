import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'js', 'vendor');
const pdfRoot = join(root, 'node_modules', 'pdfjs-dist');
const casRoot = join(root, 'node_modules', '@chikatina', 'casparser-js');
await mkdir(target, { recursive: true });

// Keep Mozilla's browser builds intact, including their Apache license header.
await cp(join(pdfRoot, 'build', 'pdf.min.mjs'), join(target, 'pdf.mjs'));
await cp(join(pdfRoot, 'build', 'pdf.worker.min.mjs'), join(target, 'pdf.worker.mjs'));
for (const dir of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
  await cp(join(pdfRoot, dir), join(target, dir), { recursive: true });
}
await cp(join(pdfRoot, 'LICENSE'), join(target, 'LICENSE.pdfjs.txt'));
await cp(join(casRoot, 'LICENSE'), join(target, 'LICENSE.casparser.txt'));

// Export only the CAS reader and backend used by the app, rather than the
// package's unrelated analysis/reporting APIs. The bundle has no CDN imports.
await build({
  stdin: {
    contents: [
      "export { readCasPdf } from '@chikatina/casparser-js';",
      "export { createPdfjsBackend, setPdfBackend } from '@chikatina/casparser-js';",
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'casparser-entry.js',
  },
  outfile: join(target, 'casparser.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120', 'firefox121', 'safari17.4'],
  minify: true,
  legalComments: 'eof',
  banner: { js: '/*! @chikatina/casparser-js 1.0.0 — MIT. See LICENSE.casparser.txt. */' },
});

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(target, 'README.txt'), [
  'Generated browser dependencies for Wealth Dashboard.',
  'Rebuild with npm ci --ignore-scripts && npm run build:vendor.',
  `pdfjs-dist: ${manifest.dependencies['pdfjs-dist']} (Apache-2.0)`,
  `@chikatina/casparser-js: ${manifest.dependencies['@chikatina/casparser-js']} (MIT)`,
  'Licenses and notices for fonts, CMaps, ICC profiles and WebAssembly codecs',
  'are retained alongside their respective assets.',
  '',
].join('\n'));
console.log('Built local PDF.js, worker, CAS parser and supporting assets in js/vendor/.');
