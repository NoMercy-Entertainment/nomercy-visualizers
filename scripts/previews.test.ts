import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildBundle, loadSources } from './bundle-lib';
import type { Bundle, BundleEntry } from './bundle-lib';
import { generatePreviews } from './previews-generate';
import type { PreviewResult } from './previews-generate';
import { attachPreviews, MANIFEST_FILE, previewItems, previewProblems, resultsFromManifest, syntheticFrames } from './previews-lib';
import type { PreviewManifest } from './previews-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HASH_FILE = /^[0-9a-f]{64}\.webp$/;

let bundle: Bundle;
let sources: ReturnType<typeof loadSources>;

beforeAll(() => {
	sources = loadSources(root);
	bundle = buildBundle(sources).bundle;
});

describe('the synthetic audio signal', () => {
	it('gives the same frames for the same input', () => {
		expect(syntheticFrames(24, 24)).toEqual(syntheticFrames(24, 24));
	});

	it('moves: the bass differs between a beat and the gap after it', () => {
		const frames = syntheticFrames(24, 24);
		expect(new Set(frames.map(frame => frame.bandEnergies.bass)).size).toBeGreaterThan(4);
	});
});

describe('the generator on three fixture entries', () => {
	const shader = 'shader/pulse-rings';
	let milkdrop: string;
	let unrenderable: string;
	let results: Map<string, PreviewResult>;
	let outDir: string;

	beforeAll(async () => {
		milkdrop = bundle.entries.find(entry => entry.format === 'milkdrop' && entry.renderable.webgl2)!.slug;
		unrenderable = bundle.entries.find(entry => !entry.renderable.webgl2)!.slug;
		outDir = mkdtempSync(join(process.env.TEMP ?? '.', 'viz-previews-'));
		const wanted = new Set([shader, milkdrop, unrenderable]);
		const items = previewItems(sources, bundle).filter(item => wanted.has(item.slug));
		expect(items).toHaveLength(3);
		results = new Map((await generatePreviews(items, outDir)).map(result => [result.slug, result]));
	});

	for (const which of ['shader', 'milkdrop'] as const) {
		it(`writes a 320x180 static and an animated WebP of about 3 s for the ${which}`, async () => {
			const result = results.get(which === 'shader' ? shader : milkdrop)!;
			expect(result.placeholder).toBe(false);
			expect(result.preview_static).toMatch(HASH_FILE);
			expect(result.preview_animated).toMatch(HASH_FILE);

			const still = await sharp(readFileSync(join(outDir, result.preview_static))).metadata();
			expect([still.width, still.height, still.pages ?? 1]).toEqual([320, 180, 1]);

			const moving = await sharp(readFileSync(join(outDir, result.preview_animated)), { pages: -1 }).metadata();
			expect([moving.width, moving.pageHeight]).toEqual([320, 180]);
			expect(moving.pages).toBeGreaterThan(1);
			const seconds = (moving.delay ?? []).reduce((sum, ms) => sum + ms, 0) / 1000;
			expect(seconds).toBeGreaterThan(2.5);
			expect(seconds).toBeLessThan(3.5);
		}, 120000);
	}

	it('animates: the first and middle frames of the animated WebP differ', async () => {
		const { preview_animated } = results.get(milkdrop)!;
		const raw = await sharp(readFileSync(join(outDir, preview_animated)), { pages: -1 }).raw().toBuffer({ resolveWithObject: true });
		const frame = 320 * 180 * raw.info.channels;
		const middle = Math.floor(raw.data.length / frame / 2) * frame;
		expect(raw.data.subarray(0, frame).equals(raw.data.subarray(middle, middle + frame))).toBe(false);
	});

	it('gives the unrenderable entry a flagged static placeholder', async () => {
		const result = results.get(unrenderable)!;
		expect(result.placeholder).toBe(true);
		const still = await sharp(readFileSync(join(outDir, result.preview_static))).metadata();
		expect([still.width, still.height, still.pages ?? 1]).toEqual([320, 180, 1]);
	});

	it('names every file by the hash of its bytes', async () => {
		const { createHash } = await import('node:crypto');
		for (const result of results.values()) {
			for (const name of [result.preview_static, result.preview_animated])
				expect(createHash('sha256').update(readFileSync(join(outDir, name))).digest('hex')).toBe(name.replace('.webp', ''));
		}
	});

	it('produces the same bytes twice (deterministic)', async () => {
		const items = previewItems(sources, bundle).filter(item => item.slug === shader);
		const again = (await generatePreviews(items, outDir))[0]!;
		expect(again.preview_animated).toBe(results.get(shader)!.preview_animated);
		expect(again.preview_static).toBe(results.get(shader)!.preview_static);
	}, 120000);

	it('leaves the payload content_hash unchanged when previews are attached', () => {
		const attached = attachPreviews(bundle.entries.filter(e => e.slug === shader), [...results.values()]);
		expect(attached[0]!.content_hash).toBe(bundle.entries.find(e => e.slug === shader)!.content_hash);
		expect(attached[0]!.preview_static).toBe(results.get(shader)!.preview_static);
	});
});

describe('the committed preview manifest', () => {
	const manifest = (): PreviewManifest => JSON.parse(readFileSync(join(root, MANIFEST_FILE), 'utf8')) as PreviewManifest;

	it('gives all 550 entries both previews and flags every unrenderable one', () => {
		const previewed = attachPreviews(bundle.entries, resultsFromManifest(manifest(), bundle.entries));
		expect(previewed).toHaveLength(550);
		expect(previewProblems(previewed)).toEqual([]);
		expect(previewed.filter(entry => !entry.renderable.webgl2).every(entry => entry.preview_placeholder)).toBe(true);
	});

	it('is stale-proof: a changed payload hash drops the entry from the results', () => {
		const changed = structuredClone(bundle.entries);
		changed[0]!.content_hash = '0'.repeat(64);
		expect(resultsFromManifest(manifest(), changed)).toHaveLength(549);
	});
});

describe('the bundle preview check', () => {
	const hash = (char: string): string => `${char.repeat(64)}.webp`;
	const complete = (entry: BundleEntry, placeholder = false): BundleEntry & { preview_static: string; preview_animated: string; preview_placeholder: boolean } =>
		({ ...entry, preview_static: hash('a'), preview_animated: hash('b'), preview_placeholder: placeholder });

	it('passes entries that carry both preview fields', () => {
		const entries = bundle.entries.slice(0, 3).map(entry => complete(entry, !entry.renderable.webgl2));
		expect(previewProblems(entries)).toEqual([]);
	});

	it('fails on a planted entry that misses preview_animated', () => {
		const entries = bundle.entries.slice(0, 3).map(entry => complete(entry, !entry.renderable.webgl2));
		delete (entries[1] as Partial<typeof entries[1]>).preview_animated;
		const problems = previewProblems(entries);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(entries[1]!.slug);
		expect(problems[0]).toContain('preview_animated');
	});

	it('fails on a planted entry that misses preview_static', () => {
		const entries = bundle.entries.slice(0, 2).map(entry => complete(entry, !entry.renderable.webgl2));
		delete (entries[0] as Partial<typeof entries[0]>).preview_static;
		expect(previewProblems(entries).join('\n')).toContain('preview_static');
	});

	it('fails on a name that is not a content hash', () => {
		const entries = bundle.entries.slice(0, 1).map(entry => ({ ...complete(entry, !entry.renderable.webgl2), preview_static: 'pulse.webp' }));
		expect(previewProblems(entries).join('\n')).toContain('preview_static');
	});

	it('fails when an unrenderable entry is not flagged as a placeholder', () => {
		const off = bundle.entries.find(entry => !entry.renderable.webgl2)!;
		expect(previewProblems([complete(off, false)]).join('\n')).toContain('preview_placeholder');
	});

	it('fails on a bundle where no entry has previews', () => {
		expect(previewProblems(bundle.entries as never).length).toBe(bundle.entries.length);
	});
});
