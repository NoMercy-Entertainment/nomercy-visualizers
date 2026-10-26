// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

export type ShaderFormat = 'twigl-classic' | 'twigl-geek' | 'twigl-geeker' | 'twigl-geekest' | 'shadertoy' | 'kodelife';

/** The formats whose code the wrapper builds into a program; a KodeLife pass is a complete program already. */
export type WrappedShaderFormat = Exclude<ShaderFormat, 'kodelife'>;

export type Vec3 = [number, number, number];

export interface KodeLifeCamera {
	eye: Vec3;
	center: Vec3;
	up: Vec3;
	/** Vertical field of view in degrees. */
	fov: number;
	near: number;
	far: number;
}

export type KodeLifeDraw = 'fullscreen' | { mode: 'LINES' | 'POINTS' | 'TRIANGLES'; vertices: number; instances: number };

/** `spectrum` is the 16 x 16 size of the spectrum layout; `offscreen` is the render size; `screen` is the canvas. */
export type KodeLifeTarget = 'screen' | 'spectrum' | 'offscreen';

export interface KodeLifePass {
	/** The sampler name other passes read this pass's output by. */
	name: string;
	draw: KodeLifeDraw;
	target: KodeLifeTarget;
	/** Needed when `draw` is not fullscreen. */
	camera?: KodeLifeCamera;
	vertex: string;
	fragment: string;
}

export type ShaderBufferName = 'bufferA' | 'bufferB' | 'bufferC' | 'bufferD';
export type ShaderPassName = 'common' | ShaderBufferName | 'image';
export type ShaderChannelSource = 'music' | ShaderBufferName;

export interface ShaderPass {
	name: ShaderPassName;
	/** What each `iChannelN` reads. A channel left out reads the spectrum. */
	channels: Partial<Record<0 | 1 | 2 | 3, ShaderChannelSource>>;
	source: string;
}

export interface ShaderEntry {
	id: string;
	format: ShaderFormat;
	name: string;
	author: string;
	license: string;
	/** The shader code; for a multi-pass file it is the image pass. */
	source: string;
	/** Present only for a multi-pass Shadertoy file, in file order. */
	passes?: ShaderPass[];
	/** Present only for a KodeLife folder, in render order; `source` is the last pass's fragment shader. */
	kodePasses?: KodeLifePass[];
}

export interface VisualizerEntry {
	id: string;
	nameKey: string;
	kind: 'bars' | 'shader' | 'milkdrop';
	shader?: ShaderEntry;
	/** The preset file a `milkdrop` entry loads. */
	presetId?: string;
	/** Raw name and author of a `milkdrop` preset; the panel makes the display text. */
	credit?: { name: string; author: string };
}
