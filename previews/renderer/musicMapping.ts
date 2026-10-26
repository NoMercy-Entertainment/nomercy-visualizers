// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import type { VisualizationFrame } from '@nomercy-entertainment/nomercy-music-player/plugins';

import { createBeatDetector } from './beatDetector';

export type MusicInput = Pick<VisualizationFrame, 'bandEnergies' | 'energy' | 'deltaMs'>;

export interface MusicUniforms {
	uBass: number;
	uMid: number;
	uTreble: number;
	uEnergy: number;
	uBeat: number;
	uBpm: number;
	uZoom: number;
	/** 1 while the beat color grade is on, 0 once it is off: the wrapper mixes the grade by it. */
	uGrade: number;
	/** Music time in seconds: it only moves forward and runs faster on bass. Plain clock time with music speed off. */
	time: number;
}

/** The three effects the app adds on top of a shader. A switch takes effect on the next frame. */
export interface VisualizerEffects {
	beatColor: boolean;
	bassZoom: boolean;
	musicSpeed: boolean;
}

export const ALL_EFFECTS_ON: VisualizerEffects = { beatColor: true, bassZoom: true, musicSpeed: true };

export interface MusicMapper {
	step: (frame: MusicInput, effects?: VisualizerEffects) => MusicUniforms;
}

// [attack, release] time constants in seconds.
const BASS_TAU = [0.04, 0.3] as const;
const MID_TAU = [0.05, 0.25] as const;
const TREBLE_TAU = [0.03, 0.2] as const;
const ENERGY_TAU = [0.08, 0.4] as const;

const MAX_STEP_SECONDS = 0.1;
const IDLE_SPEED = 0.2;
const BASS_SPEED = 1.8;
const BASS_SLOW_SECONDS = 0.8;
const ZOOM_DEPTH = 0.15;
const ZOOM_GAIN = 2;
const BEAT_DECAY_SECONDS = 0.2;
const SILENCE_LEVEL = 0.04;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function follow(current: number, target: number, deltaSeconds: number, tau: readonly [number, number]): number {
	const seconds = target > current ? tau[0] : tau[1];
	return current + (target - current) * (1 - Math.exp(-deltaSeconds / seconds));
}

/** A slow wander for the bands while nothing plays, so the shader never freezes or goes black. */
function idleLevel(base: number, time: number, rate: number, phase: number): number {
	return base + base * 0.5 * Math.sin(time * rate + phase);
}

/** Turns analyser frames into the shader's music uniforms. Keeps its own smoothing state. */
export function createMusicMapper(): MusicMapper {
	const beats = createBeatDetector();
	let bass = 0;
	let mid = 0;
	let treble = 0;
	let energy = 0;
	let bassSlow = 0;
	let beat = 0;
	let time = 0;

	return {
		step(frame, effects = ALL_EFFECTS_ON) {
			const seconds = Math.min(Math.max(frame.deltaMs, 0) / 1000, MAX_STEP_SECONDS) || 0;
			const rawBass = clamp01(frame.bandEnergies.bass);

			bass = follow(bass, rawBass, seconds, BASS_TAU);
			mid = follow(mid, clamp01(frame.bandEnergies.mid), seconds, MID_TAU);
			treble = follow(treble, clamp01(frame.bandEnergies.treble), seconds, TREBLE_TAU);
			energy = follow(energy, clamp01(frame.energy), seconds, ENERGY_TAU);
			bassSlow += (rawBass - bassSlow) * (1 - Math.exp(-seconds / BASS_SLOW_SECONDS));

			const detected = beats.push(rawBass, seconds);
			beat = detected.beat ? 1 : beat * Math.exp(-seconds / BEAT_DECAY_SECONDS);

			time += seconds * (effects.musicSpeed ? IDLE_SPEED + BASS_SPEED * bass : 1);

			const silence = 1 - clamp01(energy / SILENCE_LEVEL);
			const pulse = clamp01((bass - bassSlow) * ZOOM_GAIN);

			return {
				uBass: Math.max(bass, silence * idleLevel(0.1, time, 0.8, 0)),
				uMid: Math.max(mid, silence * idleLevel(0.08, time, 0.6, 1)),
				uTreble: Math.max(treble, silence * idleLevel(0.06, time, 1.1, 2)),
				uEnergy: Math.max(energy, silence * idleLevel(0.15, time, 0.5, 3)),
				uBeat: beat,
				uBpm: detected.bpm,
				uZoom: effects.bassZoom ? 1 + ZOOM_DEPTH * pulse : 1,
				uGrade: effects.beatColor ? 1 : 0,
				time,
			};
		},
	};
}
