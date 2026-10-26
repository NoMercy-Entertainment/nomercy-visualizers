// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseShaderFile } from './shaderHeader';

const HEADER = [
	'// format: twigl-geekest',
	'// name: Test',
	'// author: Someone',
	'// license: CC0 1.0',
].join('\n');

function bundled(file: string): string {
	return readFileSync(fileURLToPath(new URL(`../../../shaders/${file}`, import.meta.url)), 'utf8');
}

describe('parseShaderFile', () => {
	it('reads the header and takes the rest as the source', () => {
		const entry = parseShaderFile('test', `${HEADER}\n\no=vec4(1);\n`);
		expect(entry).toEqual({
			id: 'test',
			format: 'twigl-geekest',
			name: 'Test',
			author: 'Someone',
			license: 'CC0 1.0',
			source: 'o=vec4(1);',
		});
	});

	it('accepts CRLF line endings and a byte order mark', () => {
		const entry = parseShaderFile('test', `${String.fromCodePoint(0xFEFF)}${HEADER.replace(/\n/g, '\r\n')}\r\n\r\no=vec4(1);\r\n`);
		expect(entry.source).toBe('o=vec4(1);');
		expect(entry.format).toBe('twigl-geekest');
	});

	it.each(['format', 'name', 'author', 'license'])('rejects a header without %s', (key) => {
		const lines = HEADER.split('\n').filter(line => !line.startsWith(`// ${key}:`));
		expect(() => parseShaderFile('test', `${lines.join('\n')}\n\no=vec4(1);`)).toThrow(new RegExp(key));
	});

	it('rejects an unknown format', () => {
		expect(() => parseShaderFile('test', `${HEADER.replace('twigl-geekest', 'glsl-sandbox')}\n\no=vec4(1);`)).toThrow(/format/);
	});

	it('rejects a file without source', () => {
		expect(() => parseShaderFile('test', `${HEADER}\n`)).toThrow(/source/);
	});

	it.each(['Upper', 'with space', 'dot.ted', '-lead', '', 'bars', 'a'.repeat(65)])('rejects the id %j', (id) => {
		expect(() => parseShaderFile(id, `${HEADER}\n\no=vec4(1);`)).toThrow(/id/);
	});
});

const TOY_HEADER = HEADER.replace('twigl-geekest', 'shadertoy');
const BODY = 'void mainImage(out vec4 o,vec2 c){o=vec4(1);}';

function multi(...sections: string[]): string {
	return `${TOY_HEADER}\n\n${sections.join('\n')}\n`;
}

const VALID = [
	'// pass: common',
	'float k=1.;',
	'// pass: bufferA channels: 0=music',
	BODY,
	'// pass: bufferC channels: 0=bufferA',
	BODY,
	'// pass: bufferD channels: 0=bufferC 1=bufferD',
	BODY,
	'// pass: image channels: 0=bufferA 1=bufferD',
	BODY,
];

describe('parseShaderFile pass markers', () => {
	it('reads every pass with its channels and source, in file order', () => {
		const entry = parseShaderFile('toy', multi(...VALID));
		expect(entry.passes).toEqual([
			{ name: 'common', channels: {}, source: 'float k=1.;' },
			{ name: 'bufferA', channels: { 0: 'music' }, source: BODY },
			{ name: 'bufferC', channels: { 0: 'bufferA' }, source: BODY },
			{ name: 'bufferD', channels: { 0: 'bufferC', 1: 'bufferD' }, source: BODY },
			{ name: 'image', channels: { 0: 'bufferA', 1: 'bufferD' }, source: BODY },
		]);
		expect(entry.source).toBe(BODY);
	});

	it('takes the marker right after the header lines, with or without a blank line', () => {
		const text = `${TOY_HEADER}\n${VALID.join('\n')}\n`;
		expect(parseShaderFile('toy', text).passes).toHaveLength(5);
	});

	it('leaves a file without markers single pass', () => {
		const entry = parseShaderFile('toy', `${TOY_HEADER}\n\n${BODY}\n`);
		expect('passes' in entry).toBe(false);
		expect(entry.source).toBe(BODY);
	});

	it('accepts an image pass without channels', () => {
		const entry = parseShaderFile('toy', multi('// pass: image', BODY));
		expect(entry.passes).toEqual([{ name: 'image', channels: {}, source: BODY }]);
	});

	it.each([
		['an unknown channel source', ['// pass: image channels: 0=keyboard', BODY], /keyboard/],
		['a buffer that does not exist', ['// pass: image channels: 0=bufferE', BODY], /bufferE/],
		['a channel index past 3', ['// pass: image channels: 4=music', BODY], /channel/],
		['an unknown pass name', ['// pass: bufferE', BODY, '// pass: image', BODY], /bufferE/],
		['a missing image pass', ['// pass: bufferA channels: 0=music', BODY], /image/],
		['a repeated pass', ['// pass: image', BODY, '// pass: image', BODY], /twice|repeated|duplicate/],
		['channels on common', ['// pass: common channels: 0=music', 'float k=1.;', '// pass: image', BODY], /common/],
		['a channel that reads a buffer without a pass', ['// pass: image channels: 0=bufferC', BODY], /bufferC/],
		['a pass without source', ['// pass: bufferA', '// pass: image', BODY], /bufferA/],
		['a malformed marker', ['// pass: image channels 0=music', BODY], /marker/],
		['code before the first marker', [BODY, '// pass: image', BODY], /before/],
	])('refuses %s', (_label, sections, message) => {
		expect(() => parseShaderFile('toy', multi(...sections))).toThrow(message);
	});

	it('refuses pass markers in a twigl format', () => {
		const text = `${HEADER}\n\n${VALID.join('\n')}\n`;
		expect(() => parseShaderFile('toy', text)).toThrow(/shadertoy/);
	});
});

describe('bundled shaders', () => {
	it('credits mrange and the CC0 permission with its twigl link, and keeps the source as given', () => {
		const entry = parseShaderFile('mrange-4d-fractal', bundled('mrange-4d-fractal.glsl'));
		expect(entry.format).toBe('twigl-geekest');
		expect(entry.author).toBe('mrange');
		expect(entry.license).toBe('CC0 1.0 (permission 2026-10-25, https://twigl.app/?ol=true&ss=-P4mN9lXTv2ifEwoZ1px)');
		expect(entry.source).toHaveLength(405);
		expect(entry.source.startsWith('float d,e,i,s,z;vec4 p,O;for(mat2 R=rotate2D(t/27.);')).toBe(true);
		expect(entry.source).toContain('p*=e=2./dot(p,p)');
		expect(entry.source.endsWith('/.9;')).toBe(true);
	});

	it('credits mrange and the CC0 statement on both Shadertoy shaders', () => {
		const tomb = parseShaderFile('mrange-tomb-world-of-silicon-beats', bundled('mrange-tomb-world-of-silicon-beats.glsl'));
		const field = parseShaderFile('mrange-fieldfx-2025-07-28', bundled('mrange-fieldfx-2025-07-28.glsl'));
		expect([tomb.author, field.author]).toEqual(['mrange', 'mrange']);
		expect(tomb.license).toBe('CC0 1.0 (stated in the shader description, https://www.shadertoy.com/view/WfVfDy)');
		expect(field.license).toBe('CC0 1.0 (stated in the shader description, https://www.shadertoy.com/view/t33Xzl)');
		expect(tomb.passes!.map(pass => pass.name)).toEqual(['common', 'bufferA', 'bufferB', 'bufferC', 'bufferD', 'image']);
		expect(tomb.passes!.find(pass => pass.name === 'bufferD')!.channels).toEqual({ 0: 'bufferC', 1: 'bufferD' });
		expect(tomb.passes!.find(pass => pass.name === 'image')!.channels).toEqual({ 0: 'bufferA', 1: 'bufferD' });
		expect('passes' in field).toBe(false);
	});

	it('keeps the code of each Shadertoy pass', () => {
		const tomb = parseShaderFile('mrange-tomb-world-of-silicon-beats', bundled('mrange-tomb-world-of-silicon-beats.glsl'));
		const byName = new Map(tomb.passes!.map(pass => [pass.name, pass.source]));
		expect(byName.get('common')).toContain('vec3 gb(sampler2D pp, ivec2 dir, ivec2 xy)');
		expect(byName.get('bufferA')).toContain('vec4 render(vec2 p2, vec2 q2)');
		expect(byName.get('bufferB')).toContain('smoothstep(.2,.5,dot(lum_weights_linear,c))');
		expect(byName.get('bufferC')).toContain('gb(iChannel0,ivec2(3,0),ivec2(C))');
		expect(byName.get('bufferD')).toContain('mix(b,p,.95)');
		expect(byName.get('image')).toContain('c=tanh_approx(c);');
		const field = parseShaderFile('mrange-fieldfx-2025-07-28', bundled('mrange-fieldfx-2025-07-28.glsl'));
		expect(field.source).toContain('#define BPM 114.');
		expect(field.source).toContain('O.xyz = bars(O.xyz*O.xyz);');
	});

	it('ships one original shader under Apache-2.0', () => {
		const entry = parseShaderFile('pulse-rings', bundled('pulse-rings.glsl'));
		expect(entry.author).toBe('NoMercy Entertainment');
		expect(entry.license).toBe('Apache-2.0');
	});
});
