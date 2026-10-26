import { describe, expect, it } from 'vitest';
import { canonicalJson, kodeLifePayload, milkdropPayload, shaderPayload } from './payload';
import type { MilkdropPresetFile } from './milkdrop/types';
import type { ShaderEntry } from './types';

const single: ShaderEntry = {
	id: 'made-up-rings',
	format: 'twigl-geekest',
	name: 'Made Up Rings',
	author: 'Test Author',
	license: 'CC0-1.0',
	source: 'vec2 p=FC.xy/r; o=vec4(p,0,1);',
};

const multi: ShaderEntry = {
	id: 'made-up-feedback',
	format: 'shadertoy',
	name: 'Made Up Feedback',
	author: 'Test Author',
	license: 'CC0-1.0',
	source: 'void mainImage(out vec4 c, in vec2 f) { c = texture(iChannel0, f / iResolution.xy); }',
	passes: [
		{ name: 'common', channels: {}, source: 'float k = 2.0;' },
		{ name: 'bufferA', channels: { 0: 'bufferA', 1: 'music' }, source: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(k); }' },
		{ name: 'image', channels: { 0: 'bufferA' }, source: 'void mainImage(out vec4 c, in vec2 f) { c = texture(iChannel0, f / iResolution.xy); }' },
	],
};

describe('canonicalJson', () => {
	it('sorts keys at every depth and writes no whitespace', () => {
		expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x y' } })).toBe('{"a":{"c":"x y","d":[3,{"y":2,"z":1}]},"b":1}');
	});

	it('gives the same text for the same data in any key order', () => {
		expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
	});
});

describe('shaderPayload', () => {
	it('wraps a single-pass file as one image pass', () => {
		const payload = shaderPayload(single);
		expect(payload.schema).toBe(1);
		expect(payload.format).toBe('twigl-geekest');
		expect(payload.source).toBe(single.source);
		expect(payload.passes).toHaveLength(1);
		expect(payload.passes[0]!.name).toBe('image');
		expect(payload.passes[0]!.program.startsWith('#version 300 es\n')).toBe(true);
	});

	it('wraps a multi-pass file in render order, with common merged into each pass', () => {
		const payload = shaderPayload(multi);
		expect(payload.passes.map(pass => pass.name)).toEqual(['bufferA', 'image']);
		expect(payload.passes[0]!.channels).toEqual({ 0: 'bufferA', 1: 'music' });
		expect(payload.passes.every(pass => pass.program.includes('float k = 2.0;') || pass.name === 'image')).toBe(true);
		expect(payload.passes[0]!.program).toContain('float k = 2.0;');
	});
});

describe('kodeLifePayload', () => {
	it('carries the passes as they are', () => {
		const entry: ShaderEntry = {
			id: 'made-up-kode',
			format: 'kodelife',
			name: 'Made Up Kode',
			author: 'Test Author',
			license: 'CC0-1.0',
			source: 'void main() {}',
			kodePasses: [{ name: 'post', draw: 'fullscreen', target: 'screen', vertex: '#version 300 es\nvoid main() {}', fragment: '#version 300 es\nvoid main() {}' }],
		};
		expect(kodeLifePayload(entry)).toEqual({ schema: 1, format: 'kodelife', passes: entry.kodePasses });
	});

	it('refuses an entry without passes', () => {
		expect(() => kodeLifePayload({ ...single, format: 'kodelife' })).toThrow(/no passes/);
	});
});

describe('milkdropPayload', () => {
	const file: MilkdropPresetFile = {
		schema: 1,
		id: 'made-up',
		name: 'Made Up',
		author: 'Test Author',
		sourceUrl: 'https://example.com/made-up.milk',
		sourceSha1: '0'.repeat(40),
		rights: 'projectm-presets',
		textures: ['clouds'],
		preset: { version: 2, baseVals: { zoom: 1 }, shapes: [], waves: [], init_eqs_eel: '', frame_eqs_eel: 'q1=1;', pixel_eqs_eel: '', warp: '', comp: '' },
	};

	it('keeps the preset and the texture names, and drops the file metadata', () => {
		expect(milkdropPayload(file)).toEqual({ schema: 1, format: 'milkdrop', preset: file.preset, textures: ['clouds'] });
	});
});
