import type { MilkdropPresetFile } from './milkdrop/types';
import type { KodeLifePass, ShaderEntry, ShaderPass, WrappedShaderFormat } from './types';
import { wrapPasses, wrapShader } from './wrappers';

// The payload shapes of schema v1 (schema/visualizer-payload.v1.schema.json).

export interface ShaderPassPayload {
	name: Exclude<ShaderPass['name'], 'common'>;
	channels: ShaderPass['channels'];
	/** A complete GLSL ES 3.00 fragment program. */
	program: string;
}

export interface ShaderPayload {
	schema: 1;
	format: WrappedShaderFormat;
	source: string;
	passes: ShaderPassPayload[];
}

export interface KodeLifePayload {
	schema: 1;
	format: 'kodelife';
	passes: KodeLifePass[];
}

export interface MilkdropPayload {
	schema: 1;
	format: 'milkdrop';
	preset: MilkdropPresetFile['preset'];
	textures: string[];
}

export type VisualizerPayload = ShaderPayload | KodeLifePayload | MilkdropPayload;

/** JSON with sorted keys at every depth and no whitespace: the text the content hash is taken from. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value))
		return value.map(sortKeys);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys((value as Record<string, unknown>)[key])]));
	}
	return value;
}

export function shaderPayload(entry: ShaderEntry): ShaderPayload {
	if (entry.format === 'kodelife')
		throw new Error(`"${entry.id}" is a kodelife entry; use kodeLifePayload`);
	const passes: ShaderPassPayload[] = entry.passes
		? wrapPasses(entry).map(({ name, channels, fragment }) => ({ name, channels, program: fragment }))
		: [{ name: 'image', channels: {}, program: wrapShader(entry).fragment }];
	return { schema: 1, format: entry.format, source: entry.source, passes };
}

export function kodeLifePayload(entry: ShaderEntry): KodeLifePayload {
	if (!entry.kodePasses?.length)
		throw new Error(`"${entry.id}" has no passes`);
	return { schema: 1, format: 'kodelife', passes: entry.kodePasses };
}

export function milkdropPayload(file: MilkdropPresetFile): MilkdropPayload {
	return { schema: 1, format: 'milkdrop', preset: file.preset, textures: file.textures };
}
