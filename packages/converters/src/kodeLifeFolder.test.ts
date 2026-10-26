// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { samplerNames } from './glslSource';
import { parseKodeLifeFolder } from './kodeLifeFolder';
import type { ShaderFile } from './shaderRegistryBuild';

const BUNDLED = fileURLToPath(new URL('../../../shaders/mrange-audio-reactive-vertices', import.meta.url));

function bundledFiles(): ShaderFile[] {
	return readdirSync(BUNDLED).map(file => ({ file, text: readFileSync(join(BUNDLED, file), 'utf8') }));
}

const VERTEX = `#version 300 es
uniform mat4 mvp;
in vec4 a_position;
void main() { gl_Position = mvp * a_position; }`;

function fragment(...samplers: string[]): string {
	return `#version 300 es
precision highp float;
${samplers.map(name => `uniform sampler2D ${name};`).join('\n')}
out vec4 FC;
void main() { FC = vec4(1); }`;
}

const CAMERA = { eye: [0, 0, 12], center: [0, 2, 0], up: [1, 4, 0], fov: 60, near: 1, far: 1000 };

function config(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		format: 'kodelife',
		name: 'Probe',
		author: 'Test',
		license: 'CC0 1.0',
		passes: [
			{ name: 'a', draw: 'fullscreen', target: 'spectrum' },
			{ name: 'b', draw: { mode: 'LINES', vertices: 6, instances: 100 }, target: 'offscreen', camera: CAMERA },
			{ name: 'c', draw: 'fullscreen', target: 'screen' },
		],
		...overrides,
	});
}

function folder(overrides: Record<string, string | null> = {}): ShaderFile[] {
	const files: Record<string, string | null> = {
		'kodelife.json': config(),
		'0_a_vs.glsl': VERTEX,
		'0_a_fs.glsl': fragment('input_spectrum', 'history'),
		'1_b_vs.glsl': VERTEX,
		'1_b_fs.glsl': fragment('a'),
		'2_c_vs.glsl': VERTEX,
		'2_c_fs.glsl': fragment('a', 'b'),
		...overrides,
	};
	return Object.entries(files).flatMap(([file, text]) => (text === null ? [] : [{ file, text }]));
}

function refusal(files: ShaderFile[]): string {
	try {
		parseKodeLifeFolder('probe', files);
	}
	catch (error) {
		return (error as Error).message;
	}
	return '';
}

describe('parseKodeLifeFolder', () => {
	it('reads the bundled gist folder into five passes in prefix order', () => {
		const entry = parseKodeLifeFolder('mrange-audio-reactive-vertices', bundledFiles());
		expect(entry.format).toBe('kodelife');
		expect(entry.author).toBe('mrange');
		expect(entry.kodePasses!.map(pass => pass.name)).toEqual(['smooth_spectrum', 'lines', 'blur_x', 'blur_y', 'post']);
		expect(entry.kodePasses!.map(pass => pass.target)).toEqual(['spectrum', 'offscreen', 'offscreen', 'offscreen', 'screen']);
	});

	it('keeps the lines pass draw spec and camera as numbers', () => {
		const lines = parseKodeLifeFolder('mrange-audio-reactive-vertices', bundledFiles()).kodePasses![1]!;
		expect(lines.draw).toEqual({ mode: 'LINES', vertices: 6, instances: 20_480 });
		expect(lines.camera).toEqual({ eye: [0, 6, 12], center: [0, 2, 0], up: [1, 4, 0], fov: 60, near: 1, far: 1000 });
	});

	it('hands each pass the text of its own two files, unchanged', () => {
		const files = bundledFiles();
		const text = (name: string): string => files.find(file => file.file === name)!.text;
		const passes = parseKodeLifeFolder('mrange-audio-reactive-vertices', files).kodePasses!;
		expect(passes[1]!.vertex).toBe(text('1_lines_vs.glsl'));
		expect(passes[4]!.fragment).toBe(text('4_post_fs.glsl'));
	});

	it('orders passes by the number, not by the listing or as text (10 after 2)', () => {
		const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
		const passes = names.map((name, index) => ({ name, draw: 'fullscreen', target: index === names.length - 1 ? 'screen' : 'offscreen' }));
		const files = [
			{ file: 'kodelife.json', text: config({ passes }) },
			...names.flatMap((name, index) => [
				{ file: `${index}_${name}_fs.glsl`, text: `${fragment()}\n// number-${index}` },
				{ file: `${index}_${name}_vs.glsl`, text: `${VERTEX}\n// number-${index}` },
			]),
		].reverse();
		const entry = parseKodeLifeFolder('probe', files);
		expect(entry.kodePasses!.map(pass => pass.name)).toEqual(names);
		expect(entry.kodePasses!.map(pass => /number-(\d+)/.exec(pass.fragment)![1])).toEqual(names.map((_, index) => String(index)));
		expect(entry.kodePasses!.map(pass => /number-(\d+)/.exec(pass.vertex)![1])).toEqual(names.map((_, index) => String(index)));
	});

	it('uses the last pass fragment as the entry source', () => {
		expect(parseKodeLifeFolder('probe', folder()).source).toBe(fragment('a', 'b'));
	});

	it.each([
		['a missing vertex stage', { '1_b_vs.glsl': null }, '1_b_vs.glsl'],
		['a missing fragment stage', { '2_c_fs.glsl': null }, '2_c_fs.glsl'],
		['an unknown sampler name in a fragment shader', { '2_c_fs.glsl': fragment('a', 'nope') }, '2_c_fs.glsl'],
		['an unknown sampler name in a vertex shader', { '1_b_vs.glsl': `${VERTEX}\nuniform sampler2D nope;` }, '1_b_vs.glsl'],
		['a read of the screen pass', { '0_a_fs.glsl': fragment('c') }, '0_a_fs.glsl'],
		['a missing kodelife.json', { 'kodelife.json': null }, 'kodelife.json'],
		['a kodelife.json that is not JSON', { 'kodelife.json': '{ passes: ' }, 'kodelife.json'],
		['an extra shader file with no pass', { '3_d_fs.glsl': fragment() }, '3_d_fs.glsl'],
		['a file that does not follow <n>_<name>_vs|fs', { 'lines_fs.glsl': fragment() }, 'lines_fs.glsl'],
	])('refuses %s and names %s', (_label, overrides, file) => {
		expect(refusal(folder(overrides))).toContain(file);
	});

	it.each([
		['an unknown draw mode', { mode: 'QUADS', vertices: 6, instances: 1 }],
		['zero vertices', { mode: 'LINES', vertices: 0, instances: 1 }],
		['a fraction of an instance', { mode: 'LINES', vertices: 6, instances: 1.5 }],
		['a negative instance count', { mode: 'POINTS', vertices: 1, instances: -2 }],
		['a missing instance count', { mode: 'LINES', vertices: 6 }],
		['a word that is not fullscreen', 'quad'],
	])('refuses a bad draw spec: %s', (_label, draw) => {
		const passes = JSON.parse(config()).passes;
		passes[1].draw = draw;
		expect(refusal(folder({ 'kodelife.json': config({ passes }) }))).toContain('kodelife.json');
	});

	it.each([
		['geometry without a camera', (pass: Record<string, unknown>) => delete pass.camera],
		['a camera with a missing number', (pass: Record<string, unknown>) => (pass.camera = { ...CAMERA, far: undefined })],
		['a camera whose near is not below far', (pass: Record<string, unknown>) => (pass.camera = { ...CAMERA, near: 5, far: 5 })],
		['a field of view over 179 degrees', (pass: Record<string, unknown>) => (pass.camera = { ...CAMERA, fov: 200 })],
		['an eye that is not three numbers', (pass: Record<string, unknown>) => (pass.camera = { ...CAMERA, eye: [0, 12] })],
		['an unknown target', (pass: Record<string, unknown>) => (pass.target = 'window')],
	])('refuses %s', (_label, change) => {
		const passes = JSON.parse(config()).passes;
		change(passes[1]);
		expect(refusal(folder({ 'kodelife.json': config({ passes }) }))).toContain('kodelife.json');
	});

	it('refuses a screen target that is not the last pass', () => {
		const passes = JSON.parse(config()).passes;
		passes[0].target = 'screen';
		expect(refusal(folder({ 'kodelife.json': config({ passes }) }))).toContain('screen');
	});

	it('refuses pass names that clash with the built-in samplers or repeat', () => {
		for (const name of ['history', 'input_spectrum', 'a']) {
			const passes = JSON.parse(config()).passes;
			passes[1].name = name;
			expect(refusal(folder({ 'kodelife.json': config({ passes }) })), name).toContain('kodelife.json');
		}
	});

	it('refuses a config with another format or a missing header key', () => {
		expect(refusal(folder({ 'kodelife.json': config({ format: 'shadertoy' }) }))).toContain('format');
		expect(refusal(folder({ 'kodelife.json': config({ author: '' }) }))).toContain('author');
	});
});

describe('samplerNames', () => {
	it('lists each declared sampler2D once, with or without a precision qualifier', () => {
		const source = 'uniform sampler2D a;\nuniform highp sampler2D b;\nuniform vec2 c;\nuniform sampler2D a;';
		expect(samplerNames(source)).toEqual(['a', 'b']);
	});
});
