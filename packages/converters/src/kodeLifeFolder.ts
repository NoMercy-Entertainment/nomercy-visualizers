// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { samplerNames } from './glslSource';
import { assertShaderId } from './shaderHeader';
import type { ShaderFile } from './shaderRegistryBuild';
import type { KodeLifeCamera, KodeLifeDraw, KodeLifePass, KodeLifeTarget, ShaderEntry, Vec3 } from './types';

// Build time only: scripts/build-shader-registry.mjs loads this file through shaderRegistryBuild.ts.

export const CONFIG_FILE = 'kodelife.json';
export const HISTORY_SAMPLER = 'history';
export const SPECTRUM_SAMPLER = 'input_spectrum';

const STAGE_FILE = /^(\d+)_(\w+)_(vs|fs)\.glsl$/;
const PASS_NAME = /^[a-z][a-z0-9_]*$/;
const DRAW_MODES: readonly string[] = ['LINES', 'POINTS', 'TRIANGLES'];
const TARGETS: readonly string[] = ['screen', 'spectrum', 'offscreen'];
const HEADER_KEYS = ['name', 'author', 'license'] as const;

/** A refusal that names the file to fix. */
export class KodeLifeError extends Error {
	constructor(readonly file: string, message: string) {
		super(`${file}: ${message}`);
	}
}

export type StageCheck = (source: string, stage: 'vertex' | 'fragment') => string | null;

type Json = Record<string, unknown>;

function fail(message: string): never {
	throw new KodeLifeError(CONFIG_FILE, message);
}

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function vec3(name: string, value: unknown): Vec3 {
	if (!Array.isArray(value) || value.length !== 3 || !value.every(part => typeof part === 'number' && Number.isFinite(part)))
		fail(`camera "${name}" must be three numbers`);
	return [...value] as Vec3;
}

function parseCamera(pass: string, value: unknown): KodeLifeCamera {
	if (!isObject(value))
		return fail(`pass "${pass}" draws geometry and needs a "camera"`);
	const camera: KodeLifeCamera = {
		eye: vec3('eye', value.eye),
		center: vec3('center', value.center),
		up: vec3('up', value.up),
		fov: value.fov as number,
		near: value.near as number,
		far: value.far as number,
	};
	for (const key of ['fov', 'near', 'far'] as const) {
		if (typeof camera[key] !== 'number' || !Number.isFinite(camera[key]))
			fail(`pass "${pass}" camera "${key}" must be a number`);
	}
	if (camera.fov <= 0 || camera.fov >= 180)
		fail(`pass "${pass}" camera "fov" must be above 0 and below 180 degrees`);
	if (camera.near <= 0 || camera.far <= camera.near)
		fail(`pass "${pass}" camera needs 0 < near < far`);
	if (camera.eye.every((part, index) => part === camera.center[index]) || camera.up.every(part => part === 0))
		fail(`pass "${pass}" camera needs an eye apart from the center and a non-zero up`);
	return camera;
}

function parseDraw(pass: string, value: unknown): KodeLifeDraw {
	if (value === 'fullscreen')
		return value;
	if (!isObject(value) || typeof value.mode !== 'string' || !DRAW_MODES.includes(value.mode) || !wholeNumber(value.vertices) || !wholeNumber(value.instances))
		return fail(`pass "${pass}" draw must be "fullscreen" or { mode: ${DRAW_MODES.join('|')}, vertices, instances } with whole numbers above 0`);
	return { mode: value.mode as 'LINES' | 'POINTS' | 'TRIANGLES', vertices: value.vertices, instances: value.instances };
}

interface PassConfig { name: string; draw: KodeLifeDraw; target: KodeLifeTarget; camera?: KodeLifeCamera }

function parsePassConfigs(value: unknown): PassConfig[] {
	if (!Array.isArray(value) || value.length === 0)
		fail('"passes" must list at least one pass');
	const configs = (value as unknown[]).map((raw, index): PassConfig => {
		if (!isObject(raw) || typeof raw.name !== 'string' || !PASS_NAME.test(raw.name))
			return fail(`pass ${index} needs a "name" of lowercase letters, digits and underscores`);
		const name = raw.name;
		if (name === HISTORY_SAMPLER || name === SPECTRUM_SAMPLER)
			fail(`pass "${name}" uses a built-in sampler name`);
		if (typeof raw.target !== 'string' || !TARGETS.includes(raw.target))
			fail(`pass "${name}" target must be ${TARGETS.join(', ')}`);
		const draw = parseDraw(name, raw.draw);
		return {
			name,
			draw,
			target: raw.target as KodeLifeTarget,
			...draw === 'fullscreen' ? {} : { camera: parseCamera(name, raw.camera) },
		};
	});
	configs.forEach((config, index) => {
		if (configs.findIndex(other => other.name === config.name) !== index)
			fail(`pass "${config.name}" appears twice`);
		if ((config.target === 'screen') !== (index === configs.length - 1))
			fail(index === configs.length - 1 ? `the last pass "${config.name}" must target the screen` : `only the last pass may target the screen, not "${config.name}"`);
	});
	return configs;
}

interface Stages { number: number; prefix: string; vertex?: ShaderFile; fragment?: ShaderFile; first: ShaderFile }

function groupStages(files: ShaderFile[]): Stages[] {
	const groups = new Map<number, Stages>();
	for (const file of files) {
		if (file.file === CONFIG_FILE || !file.file.endsWith('.glsl'))
			continue;
		const match = STAGE_FILE.exec(file.file);
		if (!match)
			throw new KodeLifeError(file.file, 'a pass file is named <number>_<name>_vs.glsl or <number>_<name>_fs.glsl');
		const number = Number(match[1]);
		const group = groups.get(number) ?? { number, prefix: `${match[1]}_${match[2]}`, first: file };
		const slot = match[3] === 'vs' ? 'vertex' : 'fragment';
		if (group[slot])
			throw new KodeLifeError(file.file, `another file already is stage ${match[3]} of pass number ${number}`);
		group[slot] = file;
		groups.set(number, group);
	}
	return [...groups.values()].sort((a, b) => a.number - b.number);
}

/**
 * Reads a KodeLife drop-in folder: `kodelife.json` plus `<number>_<name>_vs.glsl` and `_fs.glsl` per pass.
 * The nth pass of the config pairs with the nth number; `check` (the GLSL parser at build time) judges each stage.
 */
export function parseKodeLifeFolder(id: string, files: ShaderFile[], check?: StageCheck): ShaderEntry {
	assertShaderId(id);
	const configFile = files.find(file => file.file === CONFIG_FILE);
	if (!configFile)
		throw new KodeLifeError(CONFIG_FILE, 'is missing');
	let config: unknown;
	try {
		config = JSON.parse(configFile.text);
	}
	catch {
		return fail('is not valid JSON');
	}
	if (!isObject(config))
		return fail('must hold one JSON object');
	if (config.format !== 'kodelife')
		fail('"format" must be "kodelife"');
	for (const key of HEADER_KEYS) {
		if (typeof config[key] !== 'string' || !config[key])
			fail(`is missing "${key}"`);
	}

	const configs = parsePassConfigs(config.passes);
	const groups = groupStages(files);
	if (groups.length > configs.length)
		throw new KodeLifeError(groups[configs.length]!.first.file, `has no pass in ${CONFIG_FILE} (${configs.length} passes listed, ${groups.length} numbers in the folder)`);
	if (groups.length < configs.length)
		fail(`lists ${configs.length} passes but the folder has ${groups.length} pass numbers`);

	const allowed = new Set([HISTORY_SAMPLER, SPECTRUM_SAMPLER, ...configs.filter(pass => pass.target !== 'screen').map(pass => pass.name)]);
	const screen = configs.at(-1)!.name;
	const kodePasses = configs.map((pass, index): KodeLifePass => {
		const group = groups[index]!;
		const stage = (suffix: 'vs' | 'fs', file: ShaderFile | undefined): ShaderFile => {
			if (!file)
				throw new KodeLifeError(`${group.prefix}_${suffix}.glsl`, `is missing; pass "${pass.name}" needs both stages`);
			return file;
		};
		const vertex = stage('vs', group.vertex);
		const fragment = stage('fs', group.fragment);
		for (const source of [vertex, fragment]) {
			for (const sampler of samplerNames(source.text)) {
				if (sampler === screen)
					throw new KodeLifeError(source.file, `reads "${sampler}", the screen pass, which has no texture`);
				if (sampler === HISTORY_SAMPLER && pass.target === 'screen')
					throw new KodeLifeError(source.file, 'the screen pass has no history');
				if (!allowed.has(sampler))
					throw new KodeLifeError(source.file, `reads sampler "${sampler}"; use a pass name (${[...allowed].join(', ')})`);
			}
			const problem = check?.(source.text, source === vertex ? 'vertex' : 'fragment');
			if (problem)
				throw new KodeLifeError(source.file, problem);
		}
		return { ...pass, vertex: vertex.text, fragment: fragment.text };
	});

	return {
		id,
		format: 'kodelife',
		name: config.name as string,
		author: config.author as string,
		license: config.license as string,
		source: kodePasses.at(-1)!.fragment,
		kodePasses,
	};
}
