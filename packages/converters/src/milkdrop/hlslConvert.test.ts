// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { assertOperatorsKept, convertMilkShader, declareSamplersUniform, groupHlslOperators, passShaderLocals } from './hlslConvert';

const bare = (text: string) => text.replace(/\s+/g, '');

describe('groupHlslOperators', () => {
	it('puts parentheses around the left product of a sum, the case hlslparser turns into &&', () => {
		expect(bare(groupHlslOperators('ret = a*b + c;'))).toBe('ret=(a*b)+c;');
	});

	it('groups a chain from the left, so a later "-" or "/" keeps its meaning', () => {
		expect(bare(groupHlslOperators('x = a - b - c;'))).toBe('x=(a-b)-c;');
		expect(bare(groupHlslOperators('x = a / b / c;'))).toBe('x=(a/b)/c;');
	});

	it('follows C precedence: a product binds tighter than a sum', () => {
		expect(bare(groupHlslOperators('x = a + b*c + d;'))).toBe('x=(a+(b*c))+d;');
	});

	it('leaves a single operator alone', () => {
		expect(bare(groupHlslOperators('x = a + b;'))).toBe('x=a+b;');
	});

	it('groups inside call arguments, indexes and parentheses, and keeps the argument commas', () => {
		expect(bare(groupHlslOperators('x = tex2D(s, (uv-0.5)*0.9+0.5).xyz;'))).toBe('x=tex2D(s,((uv-0.5)*0.9)+0.5).xyz;');
		expect(bare(groupHlslOperators('x = v[i*2+1];'))).toBe('x=v[(i*2)+1];');
	});

	it('keeps a unary minus, a cast and a swizzle with their operand', () => {
		expect(bare(groupHlslOperators('x = -a*b + c;'))).toBe('x=(-a*b)+c;');
		expect(bare(groupHlslOperators('x = (float3)y*2 + 1;'))).toBe('x=((float3)y*2)+1;');
		expect(bare(groupHlslOperators('x = (a+b).xy*c.z - d;'))).toBe('x=((a+b).xy*c.z)-d;');
		expect(bare(groupHlslOperators('x = .034*a + 1.5e2;'))).toBe('x=(.034*a)+1.5e2;');
	});

	it('treats a statement, a declaration, a ternary and return as separate runs', () => {
		expect(bare(groupHlslOperators('float3 c = a*b + d; return c*2 - 1;'))).toBe('float3c=(a*b)+d;return(c*2)-1;');
		expect(bare(groupHlslOperators('x = p > q && r < s ? a*b + c : d;'))).toBe('x=(p>q)&&(r<s)?(a*b)+c:d;');
	});

	it('groups scalar logic the same way', () => {
		expect(bare(groupHlslOperators('x = a > b && c < d && e;'))).toBe('x=((a>b)&&(c<d))&&e;');
		expect(bare(groupHlslOperators('x = a || b || c;'))).toBe('x=(a||b)||c;');
	});

	it('groups the body of a #define and leaves other directives alone', () => {
		const out = groupHlslOperators('#define GetBlur1(uv) (tex2D(sampler_blur1,uv).xyz*scale1 + bias1)\n#ifdef FOO\nx = a;\n#endif\nret = GetBlur1(uv)*2;');
		const lines = out.split('\n').map(line => line.trim()).filter(Boolean);
		expect(bare(lines[0])).toBe('#defineGetBlur1(uv)((tex2D(sampler_blur1,uv).xyz*scale1)+bias1)');
		expect(lines[1]).toBe('#ifdef FOO');
		expect(lines[3]).toBe('#endif');
		expect(bare(lines[4])).toBe('ret=GetBlur1(uv)*2;');
	});

	it('drops comments', () => {
		expect(bare(groupHlslOperators('x = a*b /* why */ + c; // note\ny = 1;'))).toBe('x=(a*b)+c;y=1;');
	});

	it('returns unbalanced text unchanged, so the later check can refuse it', () => {
		expect(groupHlslOperators('x = (a*b + c;')).toBe('x = (a*b + c;');
	});

	it('gives every expression the same value, and no parenthesis level holds two operators', () => {
		let seed = 12345;
		const next = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		const ops = ['+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '!=', '&&', '||'];
		for (let run = 0; run < 300; run++) {
			let text = String(next(9) + 1);
			const count = 2 + next(5);
			for (let k = 0; k < count; k++)
				text += ` ${ops[next(ops.length)]} ${next(2) === 0 ? String(next(9) + 1) : `(${next(9) + 1} ${ops[next(5)]} ${next(9) + 1})`}`;
			const grouped = groupHlslOperators(`x = ${text};`).replace(/^\s*x\s*=\s*/, '').replace(/;\s*$/, '');
			// eslint-disable-next-line no-new-func
			const value = (source: string) => new Function(`return (${source});`)() as unknown;
			expect(value(grouped), `${text} -> ${grouped}`).toBe(value(text));
			let depth = 0;
			const operators = [0];
			for (const token of grouped.match(/<=|>=|==|!=|&&|\|\||[()+\-*/%<>]|\d+/g) ?? []) {
				if (token === '(') {
					depth++;
					operators[depth] = 0;
				}
				else if (token === ')') {
					depth--;
				}
				else if (!/^\d+$/.test(token)) {
					operators[depth]++;
					expect(operators[depth], `${text} -> ${grouped}`).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe('assertOperatorsKept', () => {
	it('passes when the GLSL has no more && or || than the HLSL', () => {
		expect(() => assertOperatorsKept('x = a*b + c;', 'x = (a * b) + c;')).not.toThrow();
		expect(() => assertOperatorsKept('x = a > b && c;', 'x = (a > b) && c;')).not.toThrow();
	});

	it('throws when the converter turned an operator into &&', () => {
		expect(() => assertOperatorsKept('x = a*b + c;', 'x = bvec2 (a * b) && bvec2 (c);')).toThrow('operator lost');
	});
});

describe('declareSamplersUniform', () => {
	it('adds uniform to a user sampler and leaves a uniform one alone', () => {
		const glsl = 'sampler2D sampler_cells;\nuniform sampler2D sampler_worms;\n  sampler3D sampler_vol;\nvec4 x;';
		expect(declareSamplersUniform(glsl)).toBe('uniform sampler2D sampler_cells;\nuniform sampler2D sampler_worms;\n  uniform sampler3D sampler_vol;\nvec4 x;');
	});
});

describe('passShaderLocals', () => {
	const glsl = (body: string) => `vec4 main_shader_sentinel(vec2 uv) {\n${body}\n    return vec4(1.0);\n}\n shader_body { \n    vec4 result = main_shader_sentinel(uv);\n    ret = result.rgb;\n }`;

	it('adds the names the function uses and does not declare, in a fixed order', () => {
		const out = passShaderLocals(glsl('float a = ang + rad;\nvec3 h = hue_shader;'), 'comp');
		expect(out).toContain('vec4 main_shader_sentinel(vec2 uv, float rad, float ang, vec3 hue_shader) {');
		expect(out).toContain('main_shader_sentinel(uv, rad, ang, hue_shader);');
	});

	it('passes uv_orig only in comp, where Butterchurn declares it inside main()', () => {
		expect(passShaderLocals(glsl('vec2 p = uv_orig;'), 'comp')).toContain('(vec2 uv, vec2 uv_orig)');
		expect(passShaderLocals(glsl('vec2 p = uv_orig;'), 'warp')).toBe(glsl('vec2 p = uv_orig;'));
	});

	it('hands a warp shader a neutral hue_shader', () => {
		const out = passShaderLocals(glsl('vec3 h = hue_shader;'), 'warp');
		expect(out).toContain('(vec2 uv, vec3 hue_shader) {');
		expect(out).toContain('main_shader_sentinel(uv, vec3(1.0));');
	});

	it('skips a name the function declares itself, and a name that only starts like one', () => {
		const text = glsl('float rad = 1.0;\nfloat ang2 = 2.0;');
		expect(passShaderLocals(text, 'comp')).toBe(text);
	});

	it('returns text without the converted function unchanged', () => {
		expect(passShaderLocals('vec4 x;', 'comp')).toBe('vec4 x;');
	});
});

describe('convertMilkShader', () => {
	const tools = {
		prepareShader: (hlsl: string) => `float4 shader_body (float2 uv : TEXCOORD0) : COLOR0\n{\n float3 ret;\n ${hlsl}\n return float4(ret, 1.0);\n}`,
		parseHlsl: async (hlsl: string) => `PARSED(${hlsl})`,
		finish: (glsl: string) => glsl,
	};

	it('returns nothing for an empty shader', async () => {
		expect(await convertMilkShader('  ', 'warp', tools)).toBe('');
	});

	it('names the entry point, groups the operators and hands the result to the parser', async () => {
		const seen: string[] = [];
		const out = await convertMilkShader('ret = a*b + c;', 'comp', { ...tools, parseHlsl: async (hlsl) => {
			seen.push(hlsl);
			return 'x';
		} });
		expect(out).toBe('x');
		expect(seen[0]).toContain('float4 main_shader_sentinel (');
		expect(bare(seen[0])).toContain('ret=(a*b)+c;');
	});

	it('refuses output in which the parser lost an operator', async () => {
		await expect(convertMilkShader('ret = a*b + c;', 'comp', { ...tools, parseHlsl: async () => 'bvec2 (a) && bvec2 (b)' })).rejects.toThrow('operator lost');
	});
});
