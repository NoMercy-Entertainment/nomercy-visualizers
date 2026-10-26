// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { presetProblem } from './presetSafety';

const SHIPPED = resolve(__dirname, '../../../../milkdrop/presets');
const FOLDER = process.env.MILKDROP_PRESETS_DIR ?? SHIPPED;

function preset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		version: 2,
		baseVals: {},
		shapes: [{ baseVals: {}, init_eqs_eel: '', frame_eqs_eel: '' }],
		waves: [{ baseVals: {}, init_eqs_eel: '', frame_eqs_eel: '', point_eqs_eel: '' }],
		init_eqs_eel: '',
		frame_eqs_eel: 'zoom=zoom+0.01*sin(time);',
		pixel_eqs_eel: '',
		warp: '',
		comp: '',
		...overrides,
	};
}

// Measured on 541 files: 0.1 s alone, 0.6 s beside two full runs. The limit only has to outlast a starved box.
const AUDIT_LIMIT_MS = 60_000;
const OPEN_FILES = 16;

/** One line per shipped preset file that holds a code field or cannot run in the WebAssembly sandbox. */
async function audit(folder: string): Promise<{ checked: number; problems: string[] }> {
	const files = (await readdir(folder)).filter(name => name.endsWith('.json'));
	const problems: string[] = [];
	let next = 0;
	// Several opens in flight, so a slow open waits beside the others instead of in front of them.
	async function lane(): Promise<void> {
		while (next < files.length) {
			const name = files[next++]!;
			const file = JSON.parse(await readFile(join(folder, name), 'utf8')) as { preset?: unknown };
			const problem = presetProblem(file.preset);
			if (problem)
				problems.push(`${name}: ${problem}`);
		}
	}
	await Promise.all(Array.from({ length: OPEN_FILES }, lane));
	return { checked: files.length, problems: problems.sort() };
}

describe('presetProblem', () => {
	it('accepts a normal EEL preset', () => {
		expect(presetProblem(preset())).toBeNull();
	});

	it('names useJS at the top level', () => {
		expect(presetProblem(preset({ useJS: true }))).toBe('useJS');
		expect(presetProblem(preset({ useJS: false }))).toBe('useJS');
	});

	it('names a non-empty _eqs_str field at the top level, in a shape and in a wave', () => {
		expect(presetProblem(preset({ frame_eqs_str: 'fetch(\'x\')' }))).toBe('frame_eqs_str');
		expect(presetProblem(preset({ shapes: [{ baseVals: {}, init_eqs_eel: '', init_eqs_str: 'a.x=1;' }] }))).toBe('shapes[0].init_eqs_str');
		expect(presetProblem(preset({ waves: [{ baseVals: {}, init_eqs_eel: '' }, { baseVals: {}, init_eqs_eel: '', point_eqs_str: 'a.x=1;' }] }))).toBe('waves[1].point_eqs_str');
	});

	// The eight places Butterchurn compiles `*_eqs_str` text with `new Function` (butterchurn.js loadJSPreset).
	it.each([
		['init_eqs_str', preset({ init_eqs_str: 'a.x=1;' })],
		['frame_eqs_str', preset({ frame_eqs_str: 'a.x=1;' })],
		['pixel_eqs_str', preset({ pixel_eqs_str: 'a.x=1;' })],
		['shapes[0].init_eqs_str', preset({ shapes: [{ baseVals: {}, init_eqs_eel: '', init_eqs_str: 'a.x=1;' }] })],
		['shapes[0].frame_eqs_str', preset({ shapes: [{ baseVals: {}, init_eqs_eel: '', frame_eqs_str: 'a.x=1;' }] })],
		['waves[0].init_eqs_str', preset({ waves: [{ baseVals: {}, init_eqs_eel: '', init_eqs_str: 'a.x=1;' }] })],
		['waves[0].frame_eqs_str', preset({ waves: [{ baseVals: {}, init_eqs_eel: '', frame_eqs_str: 'a.x=1;' }] })],
		['waves[0].point_eqs_str', preset({ waves: [{ baseVals: {}, init_eqs_eel: '', point_eqs_str: 'a.x=1;' }] })],
	])('refuses code at %s', (site, planted) => {
		expect(presetProblem(planted)).toBe(site);
	});

	it('allows an empty _eqs_str field, which Butterchurn never runs', () => {
		expect(presetProblem(preset({ frame_eqs_str: '', pixel_eqs_str: null }))).toBeNull();
	});

	it('names a preset without init_eqs_eel, which only the script path could run', () => {
		const { init_eqs_eel: _removed, ...rest } = preset();
		expect(presetProblem(rest)).toBe('init_eqs_eel missing');
	});

	it('refuses a value that is not an object', () => {
		expect(presetProblem(null)).toBe('not an object');
		expect(presetProblem('frame_eqs_str')).toBe('not an object');
	});
});

describe('planted defects in a copy of the preset folder', () => {
	const real = readdirSync(SHIPPED).filter(name => name.endsWith('.json')).slice(0, 3);

	function copyWith(planted: Record<string, unknown>): string {
		const folder = mkdtempSync(join(tmpdir(), 'milkdrop-presets-'));
		mkdirSync(folder, { recursive: true });
		for (const name of real)
			copyFileSync(join(SHIPPED, name), join(folder, name));
		const base = JSON.parse(readFileSync(join(SHIPPED, real[0]!), 'utf8')) as { preset: Record<string, unknown> };
		writeFileSync(join(folder, 'planted.json'), JSON.stringify({ ...base, id: 'planted', preset: { ...base.preset, ...planted } }));
		return folder;
	}

	it('passes the copy with no planted file', async () => {
		const folder = mkdtempSync(join(tmpdir(), 'milkdrop-presets-'));
		for (const name of real)
			copyFileSync(join(SHIPPED, name), join(folder, name));
		expect(await audit(folder)).toEqual({ checked: 3, problems: [] });
	});

	it.each([
		['useJS', { useJS: true }, 'planted.json: useJS'],
		['a top-level _eqs_str', { frame_eqs_str: 'fetch(\'x\')' }, 'planted.json: frame_eqs_str'],
		['a wave _eqs_str', { waves: [{ baseVals: {}, init_eqs_eel: '', point_eqs_str: 'a.x=1;' }] }, 'planted.json: waves[0].point_eqs_str'],
		['no init_eqs_eel', { init_eqs_eel: undefined }, 'planted.json: init_eqs_eel missing'],
	])('reports %s', async (_label, planted, expected) => {
		const result = await audit(copyWith(planted));

		expect(result.checked).toBe(4);
		expect(result.problems).toEqual([expected]);
	});
});

describe('shipped MilkDrop presets', () => {
	it('hold no code field and all carry init_eqs_eel', async () => {
		const result = await audit(FOLDER);

		expect(result.problems).toEqual([]);
		expect(result.checked).toBeGreaterThan(0);
	}, AUDIT_LIMIT_MS);
});
