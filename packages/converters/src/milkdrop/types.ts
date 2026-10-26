// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

export type BaseVals = Record<string, number>;

/** A custom shape or wave in a Butterchurn preset. A disabled slot may carry no equations at all. */
export interface ButterchurnSlot {
	baseVals: BaseVals;
	init_eqs_eel?: string;
	frame_eqs_eel?: string;
	point_eqs_eel?: string;
}

/** Butterchurn preset JSON with the equations kept as EEL text (the form 3.x compiles to WebAssembly). */
export interface ButterchurnPreset {
	version: number;
	baseVals: BaseVals;
	shapes: ButterchurnSlot[];
	waves: ButterchurnSlot[];
	init_eqs_eel: string;
	frame_eqs_eel: string;
	pixel_eqs_eel: string;
	warp: string;
	comp: string;
}

/** One preset file under `public/visualizers/milkdrop/presets/<id>.json`. Raw values only. */
export interface MilkdropPresetFile {
	schema: 1;
	id: string;
	name: string;
	author: string;
	sourceUrl: string;
	sourceSha1: string;
	/** Key into `rights.json`. */
	rights: string;
	/** Texture names the shaders sample: file stems of the texture pack, or `randNN` / `randNN_filter` tokens. */
	textures: string[];
	preset: ButterchurnPreset;
}

/** One row of `public/visualizers/milkdrop/manifest.json`, which is an array of these. */
export interface MilkdropManifestEntry {
	id: string;
	name: string;
	author: string;
	textures: string[];
}
