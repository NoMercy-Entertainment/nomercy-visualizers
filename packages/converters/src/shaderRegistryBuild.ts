// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { KodeLifeError, parseKodeLifeFolder } from './kodeLifeFolder';
import { checkProgram } from './shaderCheck';
import { parseShaderFile } from './shaderHeader';
import type { ShaderEntry } from './types';
import { wrapPasses, wrapShader } from './wrappers';

// Build time only: scripts/build-shader-registry.mjs loads this file; the app never imports it.

export interface ShaderFile {
	/** File name inside the drop-in folder, for example `pulse-rings.glsl`. */
	file: string;
	text: string;
}

export interface ShaderFolder {
	/** Folder name inside the drop-in folder; it becomes the shader id. */
	name: string;
	files: ShaderFile[];
}

export interface RegistryBuild {
	entries: ShaderEntry[];
	errors: Array<{ file: string; message: string }>;
}

function buildFolder(folder: ShaderFolder, build: RegistryBuild): void {
	try {
		build.entries.push(parseKodeLifeFolder(folder.name, folder.files, checkProgram));
	}
	catch (error) {
		const file = error instanceof KodeLifeError ? `${folder.name}/${error.file}` : folder.name;
		build.errors.push({ file, message: error instanceof Error ? error.message : String(error) });
	}
}

/** Reads every file and folder, keeps the ones whose programs parse, and names the ones that do not. */
export function buildRegistry(files: ShaderFile[], folders: ShaderFolder[] = []): RegistryBuild {
	const build: RegistryBuild = { entries: [], errors: [] };
	for (const folder of [...folders].sort((a, b) => a.name.localeCompare(b.name, 'en')))
		buildFolder(folder, build);
	for (const { file, text } of [...files].sort((a, b) => a.file.localeCompare(b.file, 'en'))) {
		try {
			const entry = parseShaderFile(file.replace(/\.glsl$/, ''), text);
			const programs = entry.passes ? wrapPasses(entry) : [{ name: '', ...wrapShader(entry) }];
			for (const { name, fragment } of programs) {
				const problem = checkProgram(fragment, 'fragment');
				if (problem)
					throw new Error(name ? `pass "${name}": ${problem}` : problem);
			}
			const vertexProblem = checkProgram(wrapShader(entry).vertex, 'vertex');
			if (vertexProblem)
				throw new Error(vertexProblem);
			build.entries.push(entry);
		}
		catch (error) {
			build.errors.push({ file, message: error instanceof Error ? error.message : String(error) });
		}
	}
	build.entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
	return build;
}
