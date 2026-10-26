// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

const AVERAGE_SECONDS = 0.8;
const THRESHOLD_RATIO = 1.35;
const THRESHOLD_MARGIN = 0.04;
const MIN_LEVEL = 0.12;
const REFRACTORY_SECONDS = 0.28;
const MAX_INTERVAL_SECONDS = 1.5;
const MIN_INTERVALS = 3;
const MAX_INTERVALS = 8;

export interface BeatResult {
	beat: boolean;
	/** Beats per minute from the median beat interval, or 0 while unknown. */
	bpm: number;
}

export interface BeatDetector {
	push: (bass: number, deltaSeconds: number) => BeatResult;
	reset: () => void;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Onset detector on the bass band: energy above a moving average, with a refractory time. */
export function createBeatDetector(): BeatDetector {
	let average = -1;
	let clock = 0;
	let lastBeat = -Infinity;
	let intervals: number[] = [];

	function bpm(): number {
		return intervals.length >= MIN_INTERVALS ? 60 / median(intervals) : 0;
	}

	return {
		push(bass, deltaSeconds) {
			clock += deltaSeconds;
			if (average < 0)
				average = bass;

			const onset = bass > MIN_LEVEL
				&& bass > average * THRESHOLD_RATIO + THRESHOLD_MARGIN
				&& clock - lastBeat >= REFRACTORY_SECONDS;

			if (onset) {
				const interval = clock - lastBeat;
				intervals = interval <= MAX_INTERVAL_SECONDS ? [...intervals, interval].slice(-MAX_INTERVALS) : [];
				lastBeat = clock;
			}
			else if (clock - lastBeat > MAX_INTERVAL_SECONDS) {
				intervals = [];
			}

			average += (bass - average) * (1 - Math.exp(-deltaSeconds / AVERAGE_SECONDS));
			return { beat: onset, bpm: bpm() };
		},
		reset() {
			average = -1;
			clock = 0;
			lastBeat = -Infinity;
			intervals = [];
		},
	};
}
