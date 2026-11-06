import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

// Keep the official PanelUI source intact; CEP styling is isolated in styles.css.
const pkg = JSON.parse(await readFile('package.json','utf8'));
const manifest = await readFile('CSXS/manifest.xml','utf8');
if (!manifest.includes(`ExtensionBundleVersion="${pkg.version}"`) || !manifest.includes(`Id="dev.lazyapps.motion.panel" Version="${pkg.version}"`)) throw new Error('Package and CEP versions must match.');
await mkdir('src/panelui', { recursive: true });
for (const name of ['button', 'input', 'frame', 'select', 'button-group', 'tooltip']) {
  const entry = JSON.parse(await readFile(`vendor/panelui/${name}.json`, 'utf8'));
  for (const file of entry.files) {
    if (!file.path.endsWith('.tsx')) throw new Error('Unexpected registry file');
    await writeFile(path.join('src/panelui', path.basename(file.path)), file.content);
  }
}
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.tsx'], bundle: true, outfile: 'dist/panel.js',
  platform: 'browser', target: 'chrome99', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', '__APP_VERSION__': JSON.stringify(pkg.version) }, legalComments: 'eof', minify: true });
for (const name of ['index.html', 'CSXS', 'host', 'assets']) {
  await cp(name, `dist/${name}`, { recursive: true });
}
await cp('src/styles.css', 'dist/styles.css');
await cp('updater/updater.cjs', 'dist/updater.cjs');
await mkdir('dist/update', { recursive: true });
await writeFile('dist/update/extract.ps1', '\uFEFF' + (await readFile('updater/extract.ps1','utf8')).replace(/^\uFEFF/,''));
await cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await mkdir('dist/licenses', { recursive: true });
for (const dependency of ['react', 'react-dom', 'scheduler', '@base-ui/react', '@base-ui/utils', '@floating-ui/react', '@floating-ui/react-dom', '@floating-ui/dom', '@floating-ui/core', '@floating-ui/utils', 'tailwind-variants', 'tailwind-merge', 'clsx', '@phosphor-icons/react']) {
  const license = `node_modules/${dependency}/LICENSE`;
  try { await cp(license, `dist/licenses/${dependency.replaceAll('/', '-')}.txt`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await cp('vendor/PanelUI.LICENSE', 'dist/licenses/PanelUI.txt');
await cp('vendor/Geist.OFL', 'dist/licenses/Geist.txt');
await writeFile('dist/build-info.json', JSON.stringify({ version: pkg.version, target: 'Chromium 99 / CEP 12 / AEFT 26.x', readOnly: false, components: ['PanelUI Button', 'PanelUI Input', 'PanelUI Frame', 'PanelUI Select', 'PanelUI ButtonGroup', 'PanelUI Tooltip'] }, null, 2));
console.log('Panneau compilé pour Chromium 99 dans dist/.');
