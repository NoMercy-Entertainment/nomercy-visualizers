import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/converters/src/payload';
import { assertUniqueSlugs, buildBundle, createValidator, loadSources } from './bundle-lib';
import type { Bundle, BundleEntry } from './bundle-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validate = createValidator(resolve(root, 'schema'));

let built: { bundle: Bundle; textures: Array<{ name: string; bytes: Buffer }> };
let milkdropEntry: BundleEntry;

beforeAll(() => {
	built = buildBundle(loadSources(root));
	milkdropEntry = built.bundle.entries.find(entry => entry.format === 'milkdrop')!;
});

function planted(change: (preset: Record<string, any>) => void): BundleEntry {
	const entry = structuredClone(milkdropEntry);
	change((entry.payload as any).preset);
	return entry;
}

describe('the real content', () => {
	it('builds 550 entries: 541 MilkDrop presets and 9 shaders', () => {
		const formats = built.bundle.entries.map(entry => entry.format);
		expect(built.bundle.entries).toHaveLength(550);
		expect(formats.filter(format => format === 'milkdrop')).toHaveLength(541);
		expect(formats.filter(format => format !== 'milkdrop')).toHaveLength(9);
	});

	it('passes the schema for every entry', () => {
		const failures = built.bundle.entries.flatMap(entry => validate(entry).map(error => `${entry.slug}: ${error}`));
		expect(failures).toEqual([]);
	});

	it('flags exactly the 36 unrenderable presets with renderable.webgl2 false', () => {
		const off = built.bundle.entries.filter(entry => !entry.renderable.webgl2);
		expect(off).toHaveLength(36);
		expect(off.every(entry => entry.format === 'milkdrop')).toBe(true);
	});

	it('hashes the canonical payload text of every entry', () => {
		for (const entry of built.bundle.entries) {
			const text = canonicalJson(entry.payload);
			expect(entry.content_hash).toBe(createHash('sha256').update(text).digest('hex'));
			expect(entry.payload_bytes).toBe(Buffer.byteLength(text));
		}
	});

	it('sorts entries by slug and builds the same bundle twice', () => {
		const slugs = built.bundle.entries.map(entry => entry.slug);
		expect(slugs).toEqual([...slugs].sort());
		expect(canonicalJson(buildBundle(loadSources(root)).bundle)).toBe(canonicalJson(built.bundle));
	});

	it('lists a texture file for every non-random texture a preset names', () => {
		const files = new Set(built.bundle.textures.map(texture => texture.name.replace(/\.jpg$/, '')));
		const named = built.bundle.entries.flatMap(entry => entry.textures).filter(name => !/^rand\d\d/.test(name));
		expect(named.filter(name => !files.has(name))).toEqual([]);
		expect(built.textures.map(texture => texture.name).sort()).toEqual(built.bundle.textures.map(texture => texture.name).sort());
	});
});

describe('the schema refuses JavaScript in a payload', () => {
	it('accepts the unchanged entry', () => {
		expect(validate(milkdropEntry)).toEqual([]);
	});

	it('accepts an empty frame_eqs_str', () => {
		expect(validate(planted((preset) => { preset.frame_eqs_str = ''; }))).toEqual([]);
	});

	it('refuses useJS at the top of a preset', () => {
		expect(validate(planted((preset) => { preset.useJS = 1; })).length).toBeGreaterThan(0);
	});

	it('refuses a non-empty frame_eqs_str', () => {
		expect(validate(planted((preset) => { preset.frame_eqs_str = 'a=1;'; })).length).toBeGreaterThan(0);
	});

	it('refuses a non-empty init_eqs_str in a shape', () => {
		expect(validate(planted((preset) => { preset.shapes[2].init_eqs_str = 'x'; })).length).toBeGreaterThan(0);
	});

	it('refuses a non-empty point_eqs_str in a wave', () => {
		expect(validate(planted((preset) => { preset.waves[0].point_eqs_str = 'x'; })).length).toBeGreaterThan(0);
	});

	it('refuses an unknown key that could carry code', () => {
		expect(validate(planted((preset) => { preset.onload = 'alert(1)'; })).length).toBeGreaterThan(0);
	});

	it('refuses an unknown key in a shader pass', () => {
		const shader = structuredClone(built.bundle.entries.find(entry => entry.format !== 'milkdrop' && entry.format !== 'kodelife')!);
		(shader.payload as any).passes[0].script = 'x';
		expect(validate(shader).length).toBeGreaterThan(0);
	});
});

describe('the build refuses bad input', () => {
	it('refuses a preset with useJS before it reaches the bundle', () => {
		const sources = loadSources(root);
		(sources.presets[0]!.preset as any).useJS = 1;
		expect(() => buildBundle(sources)).toThrow(/useJS/);
	});

	it('refuses a preset with a non-empty frame_eqs_str', () => {
		const sources = loadSources(root);
		(sources.presets[0]!.preset as any).frame_eqs_str = 'a=1;';
		expect(() => buildBundle(sources)).toThrow(/frame_eqs_str/);
	});

	it('refuses a shape with a non-empty init_eqs_str', () => {
		const sources = loadSources(root);
		(sources.presets[0]!.preset.shapes[2] as any).init_eqs_str = 'x';
		expect(() => buildBundle(sources)).toThrow(/init_eqs_str/);
	});

	it('refuses two entries with one slug', () => {
		const twin = structuredClone(milkdropEntry);
		expect(() => assertUniqueSlugs([milkdropEntry, twin])).toThrow(/slug/);
	});

	it('refuses two sources that map to one slug', () => {
		const sources = loadSources(root);
		sources.presets.push({ ...structuredClone(sources.presets[0]!) });
		expect(() => buildBundle(sources)).toThrow(/slug/);
	});
});
