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

import { checkProgram } from './shaderCheck';
import type { ShaderEntry, WrappedShaderFormat } from './types';
import { GRADE_HUE_TURN, gradeGain, HIGHLIGHT_KNEE, shaderInputs, softHighlight, wrapperItems, wrapShader } from './wrappers';

const MUSIC_UNIFORMS = ['uBass', 'uMid', 'uTreble', 'uEnergy', 'uBeat', 'uBpm', 'uZoom', 'uSpectrum'];

const MODE_OF: Record<WrappedShaderFormat, keyof typeof wrapperItems> = {
	'twigl-classic': 'classic',
	'twigl-geek': 'geek',
	'twigl-geeker': 'geeker',
	'twigl-geekest': 'geekest',
	'shadertoy': 'shadertoy',
};

const MINIMAL: Record<WrappedShaderFormat, string> = {
	'twigl-classic': 'void main(void){gl_FragColor=vec4(gl_FragCoord.xy/resolution,abs(sin(time)),1.);}',
	'twigl-geek': 'void main(){gl_FragColor=vec4(gl_FragCoord.xy/r,abs(sin(t)),1.);}',
	'twigl-geeker': 'void main(){o=vec4(gl_FragCoord.xy/r,abs(sin(t)),1.);}',
	'twigl-geekest': 'o=vec4(FC.xy/r,sin(t)*.5+.5,1);',
	'shadertoy': 'void mainImage(out vec4 c,in vec2 p){float f=texelFetch(iChannel0,ivec2(10,0),0).x;c=vec4(f,p/iResolution.xy,1.);}',
};

const BROKEN: Record<WrappedShaderFormat, string> = {
	'twigl-classic': 'void main(void){gl_FragColor=vec4(1.0;}',
	'twigl-geek': 'void main(){gl_FragColor=vec4(1.0;}',
	'twigl-geeker': 'void main(){o=vec4(1.0;}',
	'twigl-geekest': 'o=vec4(FC.xy/r,sin(t)*.5+.5,1;',
	'shadertoy': 'void mainImage(out vec4 c,in vec2 p){c=vec4(1.0;}',
};

const FORMATS = Object.keys(MINIMAL) as WrappedShaderFormat[];

function entryOf(format: WrappedShaderFormat, source: string): ShaderEntry {
	return { id: 'probe', format, name: 'Probe', author: 'Test', license: 'CC0 1.0', source };
}

describe('wrapShader', () => {
	it.each(FORMATS)('wraps a minimal %s shader into a program the parser accepts', (format) => {
		const { fragment, vertex } = wrapShader(entryOf(format, MINIMAL[format]));
		expect(checkProgram(fragment, 'fragment')).toBeNull();
		expect(checkProgram(vertex, 'vertex')).toBeNull();
	});

	it.each(FORMATS)('rejects a %s shader with a syntax error', (format) => {
		const { fragment } = wrapShader(entryOf(format, BROKEN[format]));
		expect(checkProgram(fragment, 'fragment')).toEqual(expect.any(String));
	});

	it.each(FORMATS)('declares the music uniforms in %s', (format) => {
		const { fragment, uniforms } = wrapShader(entryOf(format, MINIMAL[format]));
		expect(fragment.startsWith('#version 300 es')).toBe(true);
		for (const name of MUSIC_UNIFORMS) {
			expect(fragment).toMatch(new RegExp(`uniform\\s+(float|sampler2D)\\s+${name};`));
			expect(uniforms).toContain(name);
		}
	});

	it.each(FORMATS)('puts every %s item into the program', (format) => {
		const { fragment } = wrapShader(entryOf(format, MINIMAL[format]));
		for (const item of wrapperItems[MODE_OF[format]]) {
			if (item.kind === 'wrapper' && format === 'twigl-geekest')
				continue;
			expect(fragment, item.name).toContain(item.text);
		}
	});

	it('adds the main wrapper to a twigl geekest body and nothing else', () => {
		const { fragment } = wrapShader(entryOf('twigl-geekest', MINIMAL['twigl-geekest']));
		const [start, end] = wrapperItems.geekest.filter(item => item.kind === 'wrapper');
		expect(fragment).toContain(`${start!.text}${MINIMAL['twigl-geekest']}${end!.text}`);
	});

	it('leaves a twigl geekest shader that has its own main alone', () => {
		const source = 'void main(){o=vec4(1.);}';
		const { fragment } = wrapShader(entryOf('twigl-geekest', source));
		const [start] = wrapperItems.geekest.filter(item => item.kind === 'wrapper');
		expect(fragment).not.toContain(`${start!.text}${source}`);
		expect(checkProgram(fragment, 'fragment')).toBeNull();
	});

	it('scales the fragment coordinate by uZoom around the center', () => {
		for (const format of FORMATS) {
			const { fragment } = wrapShader(entryOf(format, MINIMAL[format]));
			expect(fragment).toContain('#define gl_FragCoord nmFragCoord');
			expect(fragment).toMatch(/nmFragCoord\s*=\s*nmZoom\(gl_FragCoord/);
		}
	});

	it('passes the output through the grade', () => {
		for (const format of FORMATS)
			expect(wrapShader(entryOf(format, MINIMAL[format])).fragment).toMatch(/nmGrade\(/);
	});

	it.each(FORMATS)('mixes the %s grade by uGrade, so grade 0 leaves the shader output as it is', (format) => {
		const { fragment, uniforms } = wrapShader(entryOf(format, MINIMAL[format]));
		const grade = fragment.slice(fragment.indexOf('vec4 nmGrade('));

		expect(fragment).toContain('uniform float uGrade;');
		expect(uniforms).toContain('uGrade');
		expect(grade).toMatch(/mix\(\s*\w+(\.rgb)?\s*,\s*\w+(\.rgb)?\s*,\s*uGrade\s*\)/);
		expect(checkProgram(fragment, 'fragment')).toBeNull();
	});

	it('rolls bright light off below white instead of clipping it, at the loudest energy', () => {
		const loudestWhite = softHighlight(gradeGain(1));
		expect(loudestWhite).toBeLessThan(1);
		expect(loudestWhite).toBeGreaterThan(HIGHLIGHT_KNEE);
		expect(softHighlight(HIGHLIGHT_KNEE - 0.1)).toBeCloseTo(HIGHLIGHT_KNEE - 0.1, 6);
		expect(softHighlight(0.9)).toBeLessThan(softHighlight(1.2));
	});

	it('keeps the beat hue turn small, so a shader keeps its own palette', () => {
		expect(GRADE_HUE_TURN).toBeLessThanOrEqual(0.35);
		expect(gradeGain(1)).toBeLessThanOrEqual(1.15);
	});

	it.each(FORMATS)('builds the %s grade from the same numbers the tests check', (format) => {
		const { fragment } = wrapShader(entryOf(format, MINIMAL[format]));
		expect(fragment).toContain(`uBeat * ${GRADE_HUE_TURN.toFixed(3)}`);
		expect(fragment).toContain(`${HIGHLIGHT_KNEE.toFixed(3)}`);
		expect(checkProgram(fragment, 'fragment')).toBeNull();
	});

	it('does not declare a uniform twice when the twigl classic source already has it', () => {
		const source = 'uniform vec2 resolution;void main(){gl_FragColor=vec4(gl_FragCoord.xy/resolution,0.,1.);}';
		const { fragment } = wrapShader(entryOf('twigl-classic', source));
		expect(fragment.match(/uniform vec2 resolution;/g)).toHaveLength(1);
		expect(checkProgram(fragment, 'fragment')).toBeNull();
	});

	it('maps Shadertoy iChannel0 to the spectrum texture', () => {
		const { fragment, uniforms } = wrapShader(entryOf('shadertoy', MINIMAL.shadertoy));
		expect(fragment).toContain('#define iChannel0 uSpectrum');
		expect(uniforms).not.toContain('iChannel0');
	});

	it.each(FORMATS)('lists the %s resolution and time inputs among the uniforms', (format) => {
		const { uniforms } = wrapShader(entryOf(format, MINIMAL[format]));
		const inputs = shaderInputs[format];
		expect(uniforms).toContain(inputs.resolution.name);
		expect(uniforms).toContain(inputs.time);
		expect(uniforms).toContain(inputs.frame.name);
		expect(uniforms).toContain(inputs.mouse.name);
	});

	it('uses the full-screen triangle vertex shader', () => {
		expect(wrapShader(entryOf('twigl-geekest', MINIMAL['twigl-geekest'])).vertex).toContain('gl_VertexID');
	});
});

describe('wrapperItems', () => {
	it('holds every item twigl and Shadertoy define', () => {
		const counts = Object.fromEntries(Object.entries(wrapperItems).map(([mode, items]) => [mode, items.length]));
		expect(counts).toEqual({ classic: 6, geek: 6, geeker: 9, geekest: 33, shadertoy: 14 });
	});
});

describe('wrappers.ts license notices', () => {
	const text = readFileSync(fileURLToPath(new URL('./wrappers.ts', import.meta.url)), 'utf8');

	it('carries the twigl copyright and the notice its license requires', () => {
		expect(text).toContain('Copyright (c) 2020 doxas');
		expect(text).toContain('The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.');
	});

	it('carries the Ashima Arts MIT notice for the noise helpers', () => {
		expect(text).toContain('Ashima Arts');
		expect(text).toContain('MIT');
	});
});
