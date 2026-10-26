import type { ShaderEntry } from '../packages/converters/src/types';
import { buildRegistry } from '../packages/converters/src/shaderRegistryBuild';
import type { Bundle, BundleEntry, Sources } from './bundle-lib';

export const PREVIEW_WIDTH = 320;
export const PREVIEW_HEIGHT = 180;
export const PREVIEW_FPS = 12;
export const PREVIEW_SECONDS = 3;
/** The signal steps at twice the preview rate so the feedback effects move smoothly; every second step is kept. */
export const SIM_FPS = PREVIEW_FPS * 2;
export const CAPTURE_EVERY = 2;
export const MANIFEST_FILE = 'previews/manifest.json';
export const PREVIEW_FILE =/^[0-9a-f]{64}\.webp$/;

export interface SyntheticFrame {
	frequency: number[];
	waveform: number[];
	deltaMs: number;
	energy: number;
	bandEnergies: { bass: number; mid: number; treble: number };
}

export type PreviewJob =
	| { kind: 'shader'; entry: ShaderEntry }
	| { kind: 'milkdrop'; preset: unknown; textures: Record<string, string> };

export interface PreviewItem { slug: string; renderable: boolean; job: PreviewJob | null }

export interface PreviewResult {
	slug: string;
	placeholder: boolean;
	preview_static: string;
	preview_animated: string;
	static_bytes: number;
	animated_bytes: number;
}

export interface PreviewFields { preview_static: string; preview_animated: string; preview_placeholder: boolean }
export type PreviewedEntry = BundleEntry & Partial<PreviewFields>;

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6D2B79F5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return (((value ^ (value >>> 14)) >>> 0) / 4294967296);
	};
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const byte = (value: number): number => Math.round(clamp01(value) * 255);
const bump = (x: number, center: number, width: number): number => Math.exp(-(((x - center) / width) ** 2));

/** Made-up music: a 120 BPM kick, a slow chord sweep and hats. The same arguments always give the same frames. */
export function syntheticFrames(fps: number, count: number): SyntheticFrame[] {
	return Array.from({ length: count }, (_, index) => {
		const time = index / fps;
		const random = mulberry32(index + 1);
		const kick = Math.exp(-((time % 0.5) / 0.5) * 6);
		const bass = 0.25 + 0.65 * kick;
		const mid = 0.4 + 0.25 * Math.sin(2 * Math.PI * time / 1.5);
		const treble = 0.2 + 0.15 * random() + 0.2 * Math.exp(-(((time + 0.25) % 0.5) / 0.5) * 8);
		const frequency = Array.from({ length: 256 }, (_, bin) => {
			const x = bin / 255;
			return byte(bass * bump(x, 0.04, 0.08) + mid * bump(x, 0.3, 0.15) + treble * bump(x, 0.7, 0.2) + 0.05 * random());
		});
		const waveform = Array.from({ length: 1024 }, (_, sample) => {
			const at = time + sample / 44100;
			const level = bass * Math.sin(2 * Math.PI * 55 * at) + 0.5 * mid * Math.sin(2 * Math.PI * 440 * at) + 0.2 * treble * (random() - 0.5);
			return Math.round(128 + 90 * Math.max(-1, Math.min(1, level)));
		});
		return {
			frequency,
			waveform,
			deltaMs: 1000 / fps,
			energy: clamp01((bass + mid + treble) / 3),
			bandEnergies: { bass, mid, treble },
		};
	});
}

// Same rule as app-web's milkdrop library: a randNN token picks one named texture by a hash of the preset id.
const RANDOM_TEXTURE = /^rand\d+(?:_(.+))?$/;
const TEXTURE_NAME = /^[a-z0-9_]+$/;

function hash(text: string): number {
	let value = 5381;
	for (let i = 0; i < text.length; i++)
		value = (Math.imul(value, 33) + text.charCodeAt(i)) >>> 0;
	return value;
}

function textureStems(sources: Sources): string[] {
	const off = new Set(sources.unrenderable);
	const stems = new Set<string>();
	for (const file of sources.presets) {
		if (off.has(file.id))
			continue;
		for (const name of file.textures) {
			if (!RANDOM_TEXTURE.test(name) && TEXTURE_NAME.test(name))
				stems.add(name);
		}
	}
	return [...stems].sort();
}

function textureData(sources: Sources, presetId: string, names: string[]): Record<string, string> {
	const stems = textureStems(sources);
	const out: Record<string, string> = {};
	for (const name of names) {
		const token = RANDOM_TEXTURE.exec(name);
		const candidates = token ? (token[1] ? stems.filter(stem => stem.includes(token[1]!)) : stems) : [name];
		const stem = candidates.length > 0 ? candidates[token ? hash(`${presetId}:${name}`) % candidates.length : 0]! : null;
		const file = stem && sources.textures.find(texture => texture.name === `${stem}.jpg`);
		if (file)
			out[name] = `data:image/jpeg;base64,${file.bytes.toString('base64')}`;
	}
	return out;
}

/** One render job per bundle entry, in bundle order; an unrenderable entry has no job and gets the placeholder. */
export function previewItems(sources: Sources, bundle: Bundle): PreviewItem[] {
	const shaders = new Map(buildRegistry(sources.shaderFiles, sources.shaderFolders).entries.map(entry => [`shader/${entry.id}`, entry]));
	const presets = new Map(sources.presets.map(file => [`milkdrop/${file.id}`, file]));
	return bundle.entries.map((entry): PreviewItem => {
		const renderable = entry.renderable.webgl2;
		const shader = shaders.get(entry.slug);
		const file = presets.get(entry.slug);
		if (!renderable || (!shader && !file))
			return { slug: entry.slug, renderable, job: null };
		if (shader)
			return { slug: entry.slug, renderable, job: { kind: 'shader', entry: shader } };
		return { slug: entry.slug, renderable, job: { kind: 'milkdrop', preset: file!.preset, textures: textureData(sources, file!.id, file!.textures) } };
	});
}

export function attachPreviews(entries: BundleEntry[], results: PreviewResult[]): PreviewedEntry[] {
	const bySlug = new Map(results.map(result => [result.slug, result]));
	return entries.map((entry) => {
		const result = bySlug.get(entry.slug);
		if (!result)
			return entry;
		return { ...entry, preview_static: result.preview_static, preview_animated: result.preview_animated, preview_placeholder: result.placeholder };
	});
}

/** Lists why an entry's preview fields are wrong; an empty list means every entry has both previews. */
export function previewProblems(entries: PreviewedEntry[]): string[] {
	const problems: string[] = [];
	for (const entry of entries) {
		const why: string[] = [];
		for (const field of ['preview_static', 'preview_animated'] as const) {
			if (typeof entry[field] !== 'string' || !PREVIEW_FILE.test(entry[field]!))
				why.push(`${field} is missing or not a content-hash file name`);
		}
		if (typeof entry.preview_placeholder !== 'boolean')
			why.push('preview_placeholder is missing');
		else if (!entry.renderable.webgl2 && !entry.preview_placeholder)
			why.push('preview_placeholder must be true for an unrenderable entry');
		if (why.length)
			problems.push(`${entry.slug}: ${why.join('; ')}`);
	}
	return problems;
}

export interface PreviewManifestEntry extends PreviewFields {
	content_hash: string;
	static_bytes: number;
	animated_bytes: number;
}

export interface PreviewManifest {
	preview_schema: 1;
	width: number;
	height: number;
	fps: number;
	seconds: number;
	entries: Record<string, PreviewManifestEntry>;
}

export function manifestFor(entries: BundleEntry[], results: PreviewResult[]): PreviewManifest {
	const hashes = new Map(entries.map(entry => [entry.slug, entry.content_hash]));
	const sorted = [...results].sort((a, b) => (a.slug < b.slug ? -1 : 1));
	return {
		preview_schema: 1,
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
		fps: PREVIEW_FPS,
		seconds: PREVIEW_SECONDS,
		entries: Object.fromEntries(sorted.map(result => [result.slug, {
			content_hash: hashes.get(result.slug)!,
			preview_static: result.preview_static,
			preview_animated: result.preview_animated,
			preview_placeholder: result.placeholder,
			static_bytes: result.static_bytes,
			animated_bytes: result.animated_bytes,
		}])),
	};
}

/** The manifest rows that still match the entry's payload hash; a changed payload needs a new preview. */
export function resultsFromManifest(manifest: PreviewManifest, entries: BundleEntry[]): PreviewResult[] {
	return entries.flatMap((entry) => {
		const row = manifest.entries[entry.slug];
		if (!row || row.content_hash !== entry.content_hash)
			return [];
		return [{ slug: entry.slug, placeholder: row.preview_placeholder, preview_static: row.preview_static, preview_animated: row.preview_animated, static_bytes: row.static_bytes, animated_bytes: row.animated_bytes }];
	});
}
