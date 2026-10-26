// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { describe, expect, it, vi } from 'vitest';

import {
	assembleBase,
	assignIds,
	buildPresetSet,
	manifestFor,
	normalizeName,
	parsePresetFileName,
	referencedTextures,
	sameEffectivePreset,
	texturesToShip,
} from './presetBuild';
import type { BuildOptions, MilkSource, PresetParts } from './presetBuild';
import type { ButterchurnPreset } from './types';

function parts(over: Partial<PresetParts> = {}): PresetParts {
	return {
		presetVersion: 2,
		baseVals: { decay: 0.95, zoom: 1.01 },
		presetInit: '',
		perFrame: 'zoom=zoom+0.01*sin(time);\r\nq1=bass;',
		perVertex: '',
		shapes: [{ baseVals: { enabled: 0 } }, { baseVals: { enabled: 0 } }, { baseVals: { enabled: 0 } }, { baseVals: { enabled: 0 } }],
		waves: [0, 1, 2, 3].map(() => ({ baseVals: {}, init_eqs_str: '', frame_eqs_str: '', point_eqs_str: '' })),
		warp: '',
		comp: '',
		...over,
	};
}

function milk(fileName: string, sha1 = 'a'.repeat(40)): MilkSource {
	return { fileName, sha1, text: fileName };
}

function options(over: Partial<BuildOptions> & { split?: (text: string) => PresetParts } = {}): BuildOptions {
	return {
		milks: [milk('Alpha - One.milk')],
		pack: [],
		textures: [],
		removed: [],
		split: () => parts(),
		convertShader: async (hlsl: string) => `converted(${hlsl})`,
		sourceUrl: fileName => `https://example.test/${encodeURIComponent(fileName)}`,
		rights: 'projectm-presets',
		...over,
	};
}

describe('parsePresetFileName', () => {
	it('splits the author from the name on the first " - "', () => {
		expect(parsePresetFileName('Alpha - One.milk')).toEqual({ name: 'One', author: 'Alpha' });
	});

	it('keeps a "+" credit line as the author', () => {
		expect(parsePresetFileName('Alpha + Beta - One.milk')).toEqual({ name: 'One', author: 'Alpha + Beta' });
	});

	it('keeps a "&" credit line as the author', () => {
		expect(parsePresetFileName('Alpha & Beta - One.milk')).toEqual({ name: 'One', author: 'Alpha & Beta' });
	});

	it('leaves the author empty when the file name has no " - "', () => {
		expect(parsePresetFileName('Just A Name.milk')).toEqual({ name: 'Just A Name', author: '' });
	});

	it('keeps later " - " separators in the name', () => {
		expect(parsePresetFileName('Alpha - One - Two (remix).MILK')).toEqual({ name: 'One - Two (remix)', author: 'Alpha' });
	});
});

describe('assignIds', () => {
	const sha = (c: string) => c.repeat(40);

	it('makes a lower-case slug of the file name', () => {
		const ids = assignIds([{ fileName: 'Eo.S. + Geiss - Glow v2 (Relief Mix).milk', sha1: sha('a') }]);
		expect(ids['Eo.S. + Geiss - Glow v2 (Relief Mix).milk']).toBe('eo-s-geiss-glow-v2-relief-mix');
	});

	it('gives every file an id that is unique, also when two names slug the same', () => {
		const files = [
			{ fileName: 'A + B - Name.milk', sha1: sha('a') },
			{ fileName: 'A & B - Name.milk', sha1: sha('b') },
			{ fileName: 'A B Name.milk', sha1: sha('c') },
		];
		const ids = Object.values(assignIds(files));
		expect(new Set(ids).size).toBe(3);
		expect(ids.every(id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
	});

	it('gives the same ids whatever the input order', () => {
		const files = [
			{ fileName: 'A + B - Name.milk', sha1: sha('a') },
			{ fileName: 'A & B - Name.milk', sha1: sha('b') },
			{ fileName: 'C - Other.milk', sha1: sha('c') },
		];
		expect(assignIds([...files].reverse())).toEqual(assignIds(files));
	});

	it('falls back to a hash id when the name has no letters or digits', () => {
		const ids = assignIds([{ fileName: '!!!.milk', sha1: 'deadbeef'.repeat(5) }]);
		expect(ids['!!!.milk']).toBe('preset-deadbeef');
	});
});

describe('referencedTextures', () => {
	it('lists named textures and random tokens, and skips the built-in samplers', () => {
		const glsl = `
			uniform sampler2D sampler_main;
			uniform sampler2D sampler_fw_main;
			uniform sampler2D sampler_noise_lq;
			uniform sampler2D sampler_pw_noise_hq;
			uniform sampler2D sampler_blur2;
			uniform sampler2D sampler_Worms;
			uniform sampler2D sampler_fc_clouds;
			uniform sampler2D sampler_rand00;
			uniform sampler2D sampler_rand01_smalltiled;
		`;
		expect(referencedTextures(glsl)).toEqual(['clouds', 'rand00', 'rand01_smalltiled', 'worms']);
	});

	it('returns nothing for a preset without shaders', () => {
		expect(referencedTextures('', '')).toEqual([]);
	});
});

describe('assembleBase', () => {
	it('keeps the equations as trimmed EEL text with unix line ends and drops the shader-model keys', () => {
		const preset = assembleBase(parts({ baseVals: { decay: 0.9, psversion: 2, milkdrop_preset_version: 201 } }));
		expect(preset.frame_eqs_eel).toBe('zoom=zoom+0.01*sin(time);\nq1=bass;');
		expect(preset.baseVals).toEqual({ decay: 0.9 });
		expect(preset.version).toBe(2);
		expect(preset.shapes).toHaveLength(4);
		expect(preset.waves).toHaveLength(4);
	});
});

describe('sameEffectivePreset', () => {
	const base = (): ButterchurnPreset => assembleBase(parts());

	it('accepts a pack preset that differs only in rating, version and disabled slots', () => {
		const pack = base();
		pack.baseVals = { ...pack.baseVals, rating: 4 };
		pack.version = 1;
		pack.shapes = [{ baseVals: {} }, { baseVals: {} }, { baseVals: {} }, { baseVals: {} }];
		expect(sameEffectivePreset(pack, base())).toBe(true);
	});

	it('rejects a pack preset whose per-frame equations differ', () => {
		const pack = base();
		pack.frame_eqs_eel = 'zoom=1;';
		expect(sameEffectivePreset(pack, base())).toBe(false);
	});

	it('rejects a pack preset whose base values differ', () => {
		const pack = base();
		pack.baseVals = { ...pack.baseVals, decay: 0.5 };
		expect(sameEffectivePreset(pack, base())).toBe(false);
	});

	it('rejects a pack preset with an enabled wave that the source does not enable', () => {
		const pack = base();
		pack.waves = [{ baseVals: { enabled: 1 }, frame_eqs_eel: 'a=1;' }, ...pack.waves.slice(1)];
		expect(sameEffectivePreset(pack, base())).toBe(false);
	});
});

describe('buildPresetSet', () => {
	it('ships a converted preset with raw header fields', async () => {
		const { presets, ledger } = await buildPresetSet(options({
			milks: [milk('Alpha + Beta - One.milk', 'b'.repeat(40))],
			split: () => parts({ warp: 'shader_body { ret = tex2D(sampler_main, uv).xyz; }' }),
		}));
		expect(presets).toHaveLength(1);
		expect(presets[0]).toMatchObject({
			schema: 1,
			id: 'alpha-beta-one',
			name: 'One',
			author: 'Alpha + Beta',
			sourceUrl: 'https://example.test/Alpha%20%2B%20Beta%20-%20One.milk',
			sourceSha1: 'b'.repeat(40),
			rights: 'projectm-presets',
			textures: [],
		});
		expect(presets[0].preset.warp).toContain('converted(shader_body');
		expect(ledger).toMatchObject({ total: 1, shipped: 1, converted: 1, reused: 0, notShipped: [] });
	});

	it('takes the author from the author list when the file name names none, and keeps a file-name author', async () => {
		const { presets } = await buildPresetSet(options({
			milks: [milk('Phat_Zylot work with lines.milk'), milk('Phat lone.milk'), milk('Alpha - One.milk'), milk('Nobody.milk')],
			authors: { 'phat-': 'Phat', 'phat-zylot-': 'Phat & Zylot', 'alpha-': 'Someone Else' },
		}));
		expect(presets.map(({ id, name, author }) => ({ id, name, author }))).toEqual(expect.arrayContaining([
			{ id: 'phat-zylot-work-with-lines', name: 'Phat_Zylot work with lines', author: 'Phat & Zylot' },
			{ id: 'phat-lone', name: 'Phat lone', author: 'Phat' },
			{ id: 'alpha-one', name: 'One', author: 'Alpha' },
			{ id: 'nobody', name: 'Nobody', author: '' },
		]));
	});

	it('reuses the pack preset when its content matches, and converts nothing', async () => {
		const convertShader = vi.fn(async () => 'never');
		const packed = { ...assembleBase(parts()), warp: 'packed warp', comp: 'packed comp' };
		const { presets, ledger } = await buildPresetSet(options({
			milks: [milk('Alpha - One.milk')],
			pack: [{ stem: 'alpha-ONE', preset: packed }],
			split: () => parts({ warp: 'shader_body {}' }),
			convertShader,
		}));
		expect(convertShader).not.toHaveBeenCalled();
		expect(presets[0].preset.warp).toBe('packed warp');
		expect(ledger).toMatchObject({ reused: 1, converted: 0, shipped: 1, packContentMismatches: [] });
	});

	it('converts a preset whose pack twin has other equations, and names it', async () => {
		const packed = { ...assembleBase(parts()), frame_eqs_eel: 'zoom=2;', warp: 'packed warp' };
		const { presets, ledger } = await buildPresetSet(options({
			pack: [{ stem: 'Alpha - One', preset: packed }],
			split: () => parts({ warp: 'shader_body {}' }),
		}));
		expect(presets[0].preset.warp).toBe('converted(shader_body {})');
		expect(ledger).toMatchObject({ reused: 0, converted: 1, packContentMismatches: ['alpha-one'] });
	});

	it('never ships an id on the removal list, and converts nothing for it', async () => {
		const convertShader = vi.fn(async () => 'x');
		const { presets, ledger } = await buildPresetSet(options({
			milks: [milk('Alpha - One.milk'), milk('Beta - Two.milk', 'c'.repeat(40))],
			removed: ['beta-two'],
			split: () => parts({ warp: 'shader_body {}' }),
			convertShader,
		}));
		expect(presets.map(p => p.id)).toEqual(['alpha-one']);
		expect(convertShader).toHaveBeenCalledTimes(1);
		expect(ledger.notShipped).toEqual([{ id: 'beta-two', fileName: 'Beta - Two.milk', reason: 'removed', detail: '' }]);
	});

	it('reports a failed conversion with its error, does not ship it, and ships the rest', async () => {
		const { presets, ledger } = await buildPresetSet(options({
			milks: [milk('Alpha - One.milk'), milk('Beta - Two.milk', 'c'.repeat(40))],
			split: text => parts({ warp: text.startsWith('Beta') ? 'bad shader' : '' }),
			convertShader: async (hlsl: string) => {
				throw new Error(`parse error near ${hlsl}`);
			},
		}));
		expect(presets.map(p => p.id)).toEqual(['alpha-one']);
		expect(ledger.notShipped).toEqual([
			{ id: 'beta-two', fileName: 'Beta - Two.milk', reason: 'conversion-failed', detail: 'parse error near bad shader' },
		]);
		expect(ledger).toMatchObject({ total: 2, shipped: 1, converted: 1 });
	});

	it('reports a preset whose split throws, and does not ship it', async () => {
		const { presets, ledger } = await buildPresetSet(options({
			split: () => {
				throw new Error('no [preset00] section');
			},
		}));
		expect(presets).toEqual([]);
		expect(ledger.notShipped[0]).toMatchObject({ reason: 'conversion-failed', detail: 'no [preset00] section' });
	});

	it('lists a missing texture and does not ship that preset', async () => {
		const { presets, ledger } = await buildPresetSet(options({
			milks: [milk('Alpha - One.milk'), milk('Beta - Two.milk', 'c'.repeat(40))],
			textures: ['worms'],
			split: text => parts({ comp: text.startsWith('Beta') ? 'sampler_nowhere sampler_worms' : 'sampler_Worms' }),
			convertShader: async hlsl => hlsl,
		}));
		expect(presets.map(p => p.id)).toEqual(['alpha-one']);
		expect(presets[0].textures).toEqual(['worms']);
		expect(ledger.notShipped).toEqual([
			{ id: 'beta-two', fileName: 'Beta - Two.milk', reason: 'texture-missing', detail: 'nowhere' },
		]);
	});

	it('keeps random-texture tokens and needs a pool file for a filtered one', async () => {
		const ok = await buildPresetSet(options({
			textures: ['smalltiled_a'],
			split: () => parts({ comp: 'sampler_rand00 sampler_rand01_smalltiled' }),
			convertShader: async hlsl => hlsl,
		}));
		expect(ok.presets[0].textures).toEqual(['rand00', 'rand01_smalltiled']);
		const missing = await buildPresetSet(options({
			textures: ['other'],
			split: () => parts({ comp: 'sampler_rand01_smalltiled' }),
			convertShader: async hlsl => hlsl,
		}));
		expect(missing.presets).toEqual([]);
		expect(missing.ledger.notShipped[0]).toMatchObject({ reason: 'texture-missing', detail: 'rand01_smalltiled' });
	});

	it('accounts for every input: each is removed, reused, converted or failed, and shipped unless a texture is missing', async () => {
		const { ledger } = await buildPresetSet(options({
			milks: ['A', 'B', 'C', 'D'].map((letter, i) => milk(`${letter} - ${i}.milk`, String(i).repeat(40))),
			removed: ['c-2'],
			split: text => parts({ warp: text.startsWith('B') ? 'boom' : '', comp: text.startsWith('D') ? 'sampler_nowhere' : '' }),
			convertShader: async (hlsl: string) => {
				if (hlsl === 'boom')
					throw new Error('boom');
				return hlsl;
			},
		}));
		expect(ledger).toMatchObject({ total: 4, removed: 1, reused: 0, converted: 2, failed: 1, textureMissing: 1, shipped: 1 });
		expect(ledger.removed + ledger.reused + ledger.converted + ledger.failed).toBe(ledger.total);
		expect(ledger.total - ledger.removed - ledger.failed - ledger.textureMissing).toBe(ledger.shipped);
		expect(ledger.notShipped).toHaveLength(ledger.total - ledger.shipped);
	});
});

describe('manifestFor and texturesToShip', () => {
	it('lists id, name, author and textures for every preset, in order', async () => {
		const { presets } = await buildPresetSet(options({
			milks: [milk('Beta - Two.milk', 'c'.repeat(40)), milk('Alpha - One.milk')],
			textures: ['worms'],
			split: () => parts({ comp: 'sampler_worms' }),
			convertShader: async hlsl => hlsl,
		}));
		expect(manifestFor(presets)).toEqual([
			{ id: 'alpha-one', name: 'One', author: 'Alpha', textures: ['worms'] },
			{ id: 'beta-two', name: 'Two', author: 'Beta', textures: ['worms'] },
		]);
	});

	it('ships each named texture once, plus the pool files a filtered random token can pick', async () => {
		const { presets } = await buildPresetSet(options({
			milks: [milk('Beta - Two.milk', 'c'.repeat(40)), milk('Alpha - One.milk')],
			textures: ['worms', 'smalltiled_a', 'smalltiled_b', 'unused'],
			split: text => parts({ comp: text.startsWith('Alpha') ? 'sampler_worms' : 'sampler_worms sampler_rand00_smalltiled' }),
			convertShader: async hlsl => hlsl,
		}));
		expect(texturesToShip(presets, ['worms', 'smalltiled_a', 'smalltiled_b', 'unused'])).toEqual(['smalltiled_a', 'smalltiled_b', 'worms']);
	});
});

describe('normalizeName', () => {
	it('lower-cases and drops everything but letters and digits', () => {
		expect(normalizeName('Eo.S. + Geiss - Glow (v2)')).toBe('eosgeissglowv2');
	});
});
