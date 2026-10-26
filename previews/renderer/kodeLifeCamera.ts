// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import type { KodeLifeCamera, Vec3 } from './types';

export const IDENTITY_MATRIX = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function normalize(vector: Vec3): Vec3 {
	const length = Math.hypot(...vector) || 1;
	return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/** Column-major product `a * b`. */
function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
	const out = new Float32Array(16);
	for (let column = 0; column < 4; column++) {
		for (let row = 0; row < 4; row++) {
			let sum = 0;
			for (let k = 0; k < 4; k++)
				sum += a[k * 4 + row]! * b[column * 4 + k]!;
			out[column * 4 + row] = sum;
		}
	}
	return out;
}

/** The perspective projection times the look-at view of a KodeLife camera, column-major for `uniformMatrix4fv`. */
export function cameraMatrix(camera: KodeLifeCamera, aspect: number): Float32Array {
	const forward = normalize(subtract(camera.center, camera.eye));
	const side = normalize(cross(forward, camera.up));
	const up = cross(side, forward);
	const view = [
		side[0],
		up[0],
		-forward[0],
		0,
		side[1],
		up[1],
		-forward[1],
		0,
		side[2],
		up[2],
		-forward[2],
		0,
		-dot(side, camera.eye),
		-dot(up, camera.eye),
		dot(forward, camera.eye),
		1,
	];

	const focal = 1 / Math.tan((camera.fov * Math.PI) / 360);
	const depth = camera.near - camera.far;
	const projection = [
		focal / aspect,
		0,
		0,
		0,
		0,
		focal,
		0,
		0,
		0,
		0,
		(camera.far + camera.near) / depth,
		-1,
		0,
		0,
		(2 * camera.far * camera.near) / depth,
		0,
	];
	return multiply(projection, view);
}
