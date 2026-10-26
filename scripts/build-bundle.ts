// Builds the normalized bundle every client and the media server read.
// Usage: tsx scripts/build-bundle.ts [--out <dir>]. Exit 0 = every entry passes the schema.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildBundle, createValidator, loadSources } from './bundle-lib';

export const BUNDLE_FILE = 'visualizers-bundle.json';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out');
const out = resolve(outFlag > 0 ? process.argv[outFlag + 1]! : join(root, 'dist'));

const { bundle, textures } = buildBundle(loadSources(root));
const validate = createValidator(join(root, 'schema'));

const failures = bundle.entries.flatMap(entry => validate(entry).map(error => `${entry.slug}: ${error}`));
if (failures.length) {
	console.error(`${failures.length} schema failure(s):`);
	failures.slice(0, 20).forEach(failure => console.error(`  ${failure}`));
	process.exit(1);
}

const json = JSON.stringify(bundle);
const gzip = gzipSync(json, { level: 9 });
mkdirSync(join(out, 'textures'), { recursive: true });
writeFileSync(join(out, BUNDLE_FILE), json);
writeFileSync(join(out, `${BUNDLE_FILE}.gz`), gzip);
for (const { name, bytes } of textures)
	writeFileSync(join(out, 'textures', name), bytes);

const formats = new Map<string, number>();
bundle.entries.forEach(entry => formats.set(entry.format, (formats.get(entry.format) ?? 0) + 1));
console.log(`${bundle.entries.length} entries passing the schema (${[...formats].map(([format, count]) => `${format} ${count}`).join(', ')})`);
console.log(`${bundle.entries.filter(entry => !entry.renderable.webgl2).length} flagged renderable.webgl2 false, ${textures.length} textures`);
console.log(`bundle_hash ${bundle.bundle_hash}`);
console.log(`${BUNDLE_FILE}: ${json.length} bytes raw, ${gzip.length} bytes gzip`);
console.log(`written to ${out}`);
