// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import type { BaseVals, ButterchurnPreset, ButterchurnSlot, MilkdropManifestEntry, MilkdropPresetFile } from './types';

// Build time only: scripts/build-milkdrop-presets.mjs loads this file; the app never imports it.

/** The fields of `milkdrop-preset-utils` `splitPreset` that the build reads. Equations are raw EEL. */
export interface PresetParts {
	presetVersion: number;
	baseVals: BaseVals;
	presetInit: string;
	perFrame: string;
	perVertex: string;
	/** Disabled shapes come back with `baseVals` only. */
	shapes: Array<{ baseVals: BaseVals; init_eqs_str?: string; frame_eqs_str?: string }>;
	waves: Array<{ baseVals: BaseVals; init_eqs_str?: string; frame_eqs_str?: string; point_eqs_str?: string }>;
	/** HLSL shader bodies; empty when the preset has none. */
	warp: string;
	comp: string;
}

export interface MilkSource {
	/** File name with the `.milk` extension. */
	fileName: string;
	/** Git blob SHA-1 of the file bytes, so the source can be found again in the upstream repo. */
	sha1: string;
	text: string;
}

export interface PackPreset {
	/** File name without `.json`. */
	stem: string;
	preset: ButterchurnPreset;
}

export interface BuildOptions {
	milks: MilkSource[];
	pack: PackPreset[];
	/** File stems of the texture pack. */
	textures: string[];
	/** Preset ids that must never ship. */
	removed: string[];
	/** Author by the tag that opens a preset id, for a file name with no `Author - ` part; a file-name author wins. */
	authors?: Record<string, string>;
	split: (text: string) => PresetParts;
	/** Converts one HLSL shader to GLSL; throws when it cannot. */
	convertShader: (hlsl: string, slot: 'warp' | 'comp') => Promise<string>;
	sourceUrl: (fileName: string) => string;
	/** Key into `rights.json` written on every preset. */
	rights: string;
}

export type NotShippedReason = 'removed' | 'conversion-failed' | 'texture-missing';

export interface NotShipped {
	id: string;
	fileName: string;
	reason: NotShippedReason;
	detail: string;
}

/** `total = removed + reused + converted + failed`; `shipped = total - removed - failed - textureMissing`. */
export interface Ledger {
	total: number;
	shipped: number;
	removed: number;
	/** Took the Butterchurn pack JSON, because its equations and values match the source. */
	reused: number;
	/** Converted from the source. */
	converted: number;
	/** The source could not be read or converted. */
	failed: number;
	/** Reused or converted, but a texture its shaders sample is not in the texture pack. */
	textureMissing: number;
	/** Sources that have a same-named file in the pack. */
	packNameMatches: number;
	/** Ids converted although the pack holds a preset of the same name, because the content differs. */
	packContentMismatches: string[];
	notShipped: NotShipped[];
}

// Keys the pack drops and the runtime does not read.
const SHADER_MODEL_KEYS = new Set(['milkdrop_preset_version', 'psversion', 'psversion_warp', 'psversion_comp']);
const BUILT_IN_SAMPLERS = new Set(['main', 'noise_lq', 'noise_lq_lite', 'noise_mq', 'noise_hq', 'noisevol_lq', 'noisevol_hq', 'blur1', 'blur2', 'blur3']);
const RANDOM_SAMPLER = /^rand\d\d(?:_(.+))?$/;
const SAMPLER_FLAG_PREFIX = /^(?:fc|pc|fw|pw)_/;

export function normalizeName(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `Author - Name.milk`: the author is everything before the first " - ", empty when there is none. */
export function parsePresetFileName(fileName: string): { name: string; author: string } {
	const stem = fileName.replace(/\.milk$/i, '');
	const cut = stem.indexOf(' - ');
	return cut === -1 ? { name: stem, author: '' } : { name: stem.slice(cut + 3), author: stem.slice(0, cut) };
}

/** The author of the longest tag that opens `id`, or empty. */
export function authorByTag(id: string, authors: Record<string, string>): string {
	const tag = Object.keys(authors).filter(prefix => id.startsWith(prefix)).sort((a, b) => b.length - a.length)[0];
	return tag === undefined ? '' : authors[tag]!;
}

function slugOf(fileName: string): string {
	return fileName
		.replace(/\.milk$/i, '')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * One unique id per file name. A slug shared by several files gets each file's SHA-1 prefix, so an id does
 * not change when another preset is added or removed (the removal list is keyed by id).
 */
export function assignIds(files: Array<{ fileName: string; sha1: string }>): Record<string, string> {
	const slugs = files.map(file => ({ file, slug: slugOf(file.fileName) }));
	const uses = new Map<string, number>();
	for (const { slug } of slugs)
		uses.set(slug, (uses.get(slug) ?? 0) + 1);

	const ids: Record<string, string> = {};
	const taken = new Set<string>();
	for (const { file, slug } of slugs) {
		let id = slug === '' ? `preset-${file.sha1.slice(0, 8)}` : slug;
		if (slug !== '' && (uses.get(slug) ?? 0) > 1)
			id = `${slug}-${file.sha1.slice(0, 6)}`;
		if (taken.has(id))
			throw new Error(`duplicate preset id ${id} (${file.fileName})`);
		taken.add(id);
		ids[file.fileName] = id;
	}
	return ids;
}

/** Texture names the HLSL samples: pack file stems or `randNN[_filter]` tokens, lower case, without built-ins. */
export function referencedTextures(...shaders: string[]): string[] {
	const names = new Set<string>();
	for (const shader of shaders) {
		for (const match of shader.matchAll(/\bsampler_(\w+)/g)) {
			const name = match[1].toLowerCase().replace(SAMPLER_FLAG_PREFIX, '');
			if (!BUILT_IN_SAMPLERS.has(name))
				names.add(name);
		}
	}
	return [...names].sort();
}

function eel(text: string | undefined): string {
	return (text ?? '').replace(/\r\n?/g, '\n').trim();
}

/** The preset without its shaders: values and EEL text exactly as the source states them. */
export function assembleBase(parts: PresetParts): ButterchurnPreset {
	const baseVals: BaseVals = {};
	for (const [key, value] of Object.entries(parts.baseVals)) {
		if (!SHADER_MODEL_KEYS.has(key))
			baseVals[key] = value;
	}
	return {
		version: parts.presetVersion,
		baseVals,
		shapes: parts.shapes.map(shape => ({
			baseVals: shape.baseVals,
			init_eqs_eel: eel(shape.init_eqs_str),
			frame_eqs_eel: eel(shape.frame_eqs_str),
		})),
		waves: parts.waves.map(wave => ({
			baseVals: wave.baseVals,
			init_eqs_eel: eel(wave.init_eqs_str),
			frame_eqs_eel: eel(wave.frame_eqs_str),
			point_eqs_eel: eel(wave.point_eqs_str),
		})),
		init_eqs_eel: eel(parts.presetInit),
		frame_eqs_eel: eel(parts.perFrame),
		pixel_eqs_eel: eel(parts.perVertex),
		warp: '',
		comp: '',
	};
}

function sameValues(a: BaseVals, b: BaseVals, ignore: string[] = []): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const key of ignore)
		keys.delete(key);
	return [...keys].every(key => a[key] === b[key]);
}

function sameSlot(a: ButterchurnSlot, b: ButterchurnSlot): boolean {
	const enabled = (slot: ButterchurnSlot) => (slot.baseVals.enabled ?? 0) !== 0;
	if (enabled(a) !== enabled(b))
		return false;
	// A disabled slot never runs, so what it holds is not content.
	if (!enabled(a))
		return true;
	return sameValues(a.baseVals, b.baseVals)
		&& eel(a.init_eqs_eel) === eel(b.init_eqs_eel)
		&& eel(a.frame_eqs_eel) === eel(b.frame_eqs_eel)
		&& eel(a.point_eqs_eel) === eel(b.point_eqs_eel);
}

/** True when the pack preset runs the same equations, values and slots as the source (rating and shaders aside). */
export function sameEffectivePreset(pack: ButterchurnPreset, source: ButterchurnPreset): boolean {
	return sameValues(pack.baseVals, source.baseVals, ['rating'])
		&& eel(pack.init_eqs_eel) === eel(source.init_eqs_eel)
		&& eel(pack.frame_eqs_eel) === eel(source.frame_eqs_eel)
		&& eel(pack.pixel_eqs_eel) === eel(source.pixel_eqs_eel)
		&& pack.shapes.length === source.shapes.length
		&& pack.waves.length === source.waves.length
		&& pack.shapes.every((slot, i) => sameSlot(slot, source.shapes[i]))
		&& pack.waves.every((slot, i) => sameSlot(slot, source.waves[i]));
}

/** Pack file stems a random token with a filter can pick from. */
function poolFor(filter: string, available: string[]): string[] {
	return available.filter(stem => stem.toLowerCase().includes(filter));
}

/** Maps referenced names to pack stems (or random tokens); `missing` names the ones the pack cannot supply. */
function resolveTextures(names: string[], available: string[]): { textures: string[]; missing: string[] } {
	const byLower = new Map(available.map(stem => [stem.toLowerCase(), stem]));
	const textures: string[] = [];
	const missing: string[] = [];
	for (const name of names) {
		const random = RANDOM_SAMPLER.exec(name);
		if (random) {
			if (random[1] && poolFor(random[1], available).length === 0)
				missing.push(name);
			else
				textures.push(name);
			continue;
		}
		const stem = byLower.get(name);
		if (stem)
			textures.push(stem);
		else
			missing.push(name);
	}
	return { textures, missing };
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export async function buildPresetSet(options: BuildOptions): Promise<{ presets: MilkdropPresetFile[]; ledger: Ledger }> {
	const ids = assignIds(options.milks);
	const removed = new Set(options.removed);
	const pack = new Map(options.pack.map(entry => [normalizeName(entry.stem), entry.preset]));
	const presets: MilkdropPresetFile[] = [];
	const ledger: Ledger = {
		total: options.milks.length,
		shipped: 0,
		removed: 0,
		reused: 0,
		converted: 0,
		failed: 0,
		textureMissing: 0,
		packNameMatches: 0,
		packContentMismatches: [],
		notShipped: [],
	};

	for (const milk of [...options.milks].sort((a, b) => compare(a.fileName, b.fileName))) {
		const id = ids[milk.fileName];
		const skip = (reason: NotShippedReason, detail: string) => ledger.notShipped.push({ id, fileName: milk.fileName, reason, detail });
		if (removed.has(id)) {
			skip('removed', '');
			ledger.removed++;
			continue;
		}

		let preset: ButterchurnPreset;
		let reused = false;
		let names: string[];
		try {
			const parts = options.split(milk.text);
			const base = assembleBase(parts);
			const packed = pack.get(normalizeName(milk.fileName.replace(/\.milk$/i, '')));
			names = referencedTextures(parts.warp, parts.comp);
			if (packed)
				ledger.packNameMatches++;
			if (packed && sameEffectivePreset(packed, base)) {
				preset = structuredClone(packed);
				reused = true;
			}
			else {
				if (packed)
					ledger.packContentMismatches.push(id);
				preset = {
					...base,
					warp: parts.warp.trim() === '' ? '' : await options.convertShader(parts.warp, 'warp'),
					comp: parts.comp.trim() === '' ? '' : await options.convertShader(parts.comp, 'comp'),
				};
			}
		}
		catch (error) {
			skip('conversion-failed', error instanceof Error ? error.message : String(error));
			ledger.failed++;
			continue;
		}
		if (reused)
			ledger.reused++;
		else
			ledger.converted++;

		const { textures, missing } = resolveTextures(names, options.textures);
		if (missing.length > 0) {
			skip('texture-missing', missing.join(', '));
			ledger.textureMissing++;
			continue;
		}

		const { name, author } = parsePresetFileName(milk.fileName);
		presets.push({
			schema: 1,
			id,
			name,
			author: author || authorByTag(id, options.authors ?? {}),
			sourceUrl: options.sourceUrl(milk.fileName),
			sourceSha1: milk.sha1,
			rights: options.rights,
			textures,
			preset,
		});
		ledger.shipped++;
	}
	return { presets, ledger };
}

export function manifestFor(presets: MilkdropPresetFile[]): MilkdropManifestEntry[] {
	return presets.map(({ id, name, author, textures }) => ({ id, name, author, textures }));
}

/** Texture files to copy: every named texture a shipped preset uses, plus the pool of each filtered random token. */
export function texturesToShip(presets: MilkdropPresetFile[], available: string[]): string[] {
	const ship = new Set<string>();
	for (const preset of presets) {
		for (const texture of preset.textures) {
			const random = RANDOM_SAMPLER.exec(texture);
			if (!random)
				ship.add(texture);
			else if (random[1])
				poolFor(random[1], available).forEach(stem => ship.add(stem));
		}
	}
	return [...ship].sort(compare);
}
