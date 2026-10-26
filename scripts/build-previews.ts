// Renders the static and animated preview of every bundle entry into dist/previews and writes previews/manifest.json.
// Usage: tsx scripts/build-previews.ts [--only slug,slug] [--out <dir>]. Needs: npx playwright-core install chromium-headless-shell
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildBundle, loadSources } from './bundle-lib';
import { generatePreviews } from './previews-generate';
import { MANIFEST_FILE, manifestFor, previewItems } from './previews-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flag = (name: string): string | undefined => {
	const at = process.argv.indexOf(name);
	return at > 0 ? process.argv[at + 1] : undefined;
};
const out = resolve(flag('--out') ?? join(root, 'dist', 'previews'));
const only = flag('--only')?.split(',');

const sources = loadSources(root);
const { bundle } = buildBundle(sources);
const items = previewItems(sources, bundle).filter(item => !only || only.includes(item.slug));

const started = Date.now();
const results = await generatePreviews(items, out);
const seconds = Math.round((Date.now() - started) / 1000);

if (!only)
	writeFileSync(join(root, MANIFEST_FILE), `${JSON.stringify(manifestFor(bundle.entries, results), null, '\t')}\n`);

const files = new Map<string, number>();
const animated = new Map<string, number>();
for (const result of results) {
	files.set(result.preview_static, result.static_bytes);
	if (!result.placeholder)
		animated.set(result.preview_animated, result.animated_bytes);
}
const sum = (map: Map<string, number>): number => [...map.values()].reduce((total, bytes) => total + bytes, 0);
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const placeholders = results.filter(result => result.placeholder).length;

console.log(`${results.length} of ${items.length} entries previewed in ${seconds} s (${placeholders} placeholders)`);
console.log(`static: ${files.size} files, ${mb(sum(files))}; animated: ${animated.size} files, ${mb(sum(animated))}`);
console.log(`written to ${out}${only ? '' : `, manifest ${MANIFEST_FILE}`}`);
