// Builds the normalized bundle every client and the media server read.
// Usage: tsx scripts/build-bundle.ts [--out <dir>]. Exit 0 = every entry passes the schema.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildBundle, createValidator, loadSources } from './bundle-lib';
import { attachPreviews, MANIFEST_FILE, previewProblems, resultsFromManifest } from './previews-lib';
import type { PreviewManifest } from './previews-lib';

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

// Previews are metadata outside the payload: the schema check above and content_hash stay as they were.
const manifestPath = join(root, MANIFEST_FILE);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as PreviewManifest : null;
const previewed = attachPreviews(bundle.entries, manifest ? resultsFromManifest(manifest, bundle.entries) : []);
const previewFailures = previewProblems(previewed);
if (previewFailures.length) {
	console.error(`${previewFailures.length} entries without both previews (run npm run build:previews):`);
	previewFailures.slice(0, 20).forEach(failure => console.error(`  ${failure}`));
	process.exit(1);
}

const json = JSON.stringify({ ...bundle, entries: previewed });
const gzip = gzipSync(json, { level: 9 });
mkdirSync(join(out, 'textures'), { recursive: true });
writeFileSync(join(out, BUNDLE_FILE), json);
writeFileSync(join(out, `${BUNDLE_FILE}.gz`), gzip);
for (const { name, bytes } of textures)
	writeFileSync(join(out, 'textures', name), bytes);

const previewDir = join(root, 'dist', 'previews');
const names = new Set(previewed.flatMap(entry => [entry.preview_static!, entry.preview_animated!]));
const present = [...names].filter(name => existsSync(join(previewDir, name)));
if (resolve(previewDir) !== resolve(out, 'previews')) {
	mkdirSync(join(out, 'previews'), { recursive: true });
	present.forEach(name => copyFileSync(join(previewDir, name), join(out, 'previews', name)));
}
const rows = manifest?.entries ?? {};
previewed.forEach(entry => console.log(`${entry.slug}  static ${entry.preview_static!.slice(0, 8)}  animated ${entry.preview_animated!.slice(0, 8)}${entry.preview_placeholder ? '  placeholder' : ''}`));
/** Bytes of the distinct files; the shared placeholder counts once, and never as an animated file. */
const previewBytes = (kind: 'static' | 'animated'): number => {
	const seen = new Map<string, number>();
	for (const entry of previewed) {
		if (kind === 'animated' && entry.preview_placeholder)
			continue;
		seen.set(entry[`preview_${kind}`]!, rows[entry.slug]![`${kind}_bytes`]);
	}
	return [...seen.values()].reduce((total, bytes) => total + bytes, 0);
};
const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const formats = new Map<string, number>();
bundle.entries.forEach(entry => formats.set(entry.format, (formats.get(entry.format) ?? 0) + 1));
console.log(`${bundle.entries.length} entries passing the schema (${[...formats].map(([format, count]) => `${format} ${count}`).join(', ')})`);
console.log(`${bundle.entries.filter(entry => !entry.renderable.webgl2).length} flagged renderable.webgl2 false, ${textures.length} textures`);
console.log(`${previewed.filter(entry => !entry.preview_placeholder).length} animated previews (${megabytes(previewBytes('animated'))}), ${names.size} files listed, ${present.length} present, static ${megabytes(previewBytes('static'))}, ${previewed.filter(entry => entry.preview_placeholder).length} placeholders`);
console.log(`bundle_hash ${bundle.bundle_hash}`);
console.log(`${BUNDLE_FILE}: ${json.length} bytes raw, ${gzip.length} bytes gzip`);
console.log(`written to ${out}`);
