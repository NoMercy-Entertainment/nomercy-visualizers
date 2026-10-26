import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildRegistry } from '../packages/converters/src/shaderRegistryBuild';
import type { ShaderFile, ShaderFolder } from '../packages/converters/src/shaderRegistryBuild';
import { presetProblem } from '../packages/converters/src/milkdrop/presetSafety';
import type { MilkdropPresetFile } from '../packages/converters/src/milkdrop/types';
import { canonicalJson, kodeLifePayload, milkdropPayload, shaderPayload } from '../packages/converters/src/payload';
import type { VisualizerPayload } from '../packages/converters/src/payload';

export interface Sources {
	shaderFiles: ShaderFile[];
	shaderFolders: ShaderFolder[];
	presets: MilkdropPresetFile[];
	unrenderable: string[];
	textures: Array<{ name: string; bytes: Buffer }>;
}

export interface BundleEntry {
	slug: string;
	name: string;
	author: string;
	license: string;
	source_url: string | null;
	source_sha1: string | null;
	format: string;
	tags: string[];
	schema: 1;
	content_hash: string;
	payload_bytes: number;
	textures: string[];
	renderable: { webgl2: boolean };
	payload: VisualizerPayload;
}

export interface BundleTexture { name: string; bytes: number; sha256: string }

export interface Bundle {
	bundle_schema: 1;
	bundle_hash: string;
	entries: BundleEntry[];
	textures: BundleTexture[];
}

// The presets carry no license of their own; rights.json holds the collection notice.
const MILKDROP_LICENSE = 'No license stated by the preset author (projectM preset collection, see rights.json)';

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadSources(root: string): Sources {
	const shaderDir = join(root, 'shaders');
	const shaderFiles: ShaderFile[] = [];
	const shaderFolders: ShaderFolder[] = [];
	for (const name of readdirSync(shaderDir).sort()) {
		const path = join(shaderDir, name);
		if (statSync(path).isDirectory()) {
			const files = readdirSync(path).sort().map(file => ({ file, text: readFileSync(join(path, file), 'utf8') }));
			shaderFolders.push({ name, files });
		}
		else if (name.endsWith('.glsl')) {
			shaderFiles.push({ file: name, text: readFileSync(path, 'utf8') });
		}
	}

	const md = join(root, 'milkdrop');
	const manifest = readJson<Array<{ id: string }>>(join(md, 'manifest.json'));
	const removed = new Set(readJson<string[]>(join(md, 'removed.json')));
	const presets = manifest
		.filter(entry => !removed.has(entry.id))
		.map(entry => readJson<MilkdropPresetFile>(join(md, 'presets', `${entry.id}.json`)));
	const textures = readdirSync(join(md, 'textures')).sort()
		.map(name => ({ name, bytes: readFileSync(join(md, 'textures', name)) }));

	return { shaderFiles, shaderFolders, presets, unrenderable: readJson<string[]>(join(md, 'unrenderable.json')), textures };
}

export function assertUniqueSlugs(entries: Array<Pick<BundleEntry, 'slug'>>): void {
	const seen = new Set<string>();
	for (const { slug } of entries) {
		if (seen.has(slug))
			throw new Error(`slug clash: "${slug}" is used by more than one entry`);
		seen.add(slug);
	}
}

function finish(fields: Omit<BundleEntry, 'schema' | 'content_hash' | 'payload_bytes'>): BundleEntry {
	const text = canonicalJson(fields.payload);
	return { ...fields, schema: 1, content_hash: sha256(text), payload_bytes: Buffer.byteLength(text) };
}

export function buildBundle(sources: Sources): { bundle: Bundle; textures: Sources['textures'] } {
	const registry = buildRegistry(sources.shaderFiles, sources.shaderFolders);
	if (registry.errors.length)
		throw new Error(`shaders refused: ${registry.errors.map(error => `${error.file}: ${error.message}`).join('; ')}`);

	const entries: BundleEntry[] = registry.entries.map(shader => finish({
		slug: `shader/${shader.id}`,
		name: shader.name.trim(),
		author: shader.author,
		license: shader.license,
		source_url: null,
		source_sha1: null,
		format: shader.format,
		tags: ['shader', shader.format],
		textures: [],
		renderable: { webgl2: true },
		payload: shader.format === 'kodelife' ? kodeLifePayload(shader) : shaderPayload(shader),
	}));

	const off = new Set(sources.unrenderable);
	for (const file of sources.presets) {
		const problem = presetProblem(file.preset);
		if (problem)
			throw new Error(`preset ${file.id} refused: ${problem}`);
		entries.push(finish({
			slug: `milkdrop/${file.id}`,
			name: file.name.trim(),
			author: file.author,
			license: MILKDROP_LICENSE,
			source_url: file.sourceUrl,
			source_sha1: file.sourceSha1,
			format: 'milkdrop',
			tags: ['milkdrop'],
			textures: file.textures,
			renderable: { webgl2: !off.has(file.id) },
			payload: milkdropPayload(file),
		}));
	}

	assertUniqueSlugs(entries);
	entries.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
	const textures = sources.textures.map(({ name, bytes }) => ({ name, bytes: bytes.length, sha256: sha256(bytes) }));
	return {
		bundle: { bundle_schema: 1, bundle_hash: sha256(canonicalJson(entries)), entries, textures },
		textures: sources.textures,
	};
}

/** Returns a function that lists why an entry fails the schema; an empty list means it passes. */
export function createValidator(schemaDir: string): (entry: unknown) => string[] {
	const ajv = new Ajv2020({ strict: true, allErrors: false });
	ajv.addSchema(readJson(join(schemaDir, 'visualizer-payload.v1.schema.json')));
	const check = ajv.compile(readJson(join(schemaDir, 'visualizer-entry.v1.schema.json')));
	return (entry) => {
		check(entry);
		return (check.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`);
	};
}
