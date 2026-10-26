// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader)
		return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS))
		return shader;
	gl.deleteShader(shader);
	return null;
}

/** Compiles and links one program, or returns null and frees everything it made. `attributes` get locations 0, 1, ... */
export function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, attributes: string[] = []): WebGLProgram | null {
	const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
	const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
	const program = vertex && fragment ? gl.createProgram() : null;
	if (program) {
		gl.attachShader(program, vertex!);
		gl.attachShader(program, fragment!);
		attributes.forEach((name, location) => gl.bindAttribLocation(program, location, name));
		gl.linkProgram(program);
	}
	if (vertex)
		gl.deleteShader(vertex);
	if (fragment)
		gl.deleteShader(fragment);
	if (program && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
		gl.deleteProgram(program);
		return null;
	}
	return program;
}

/** The uniform locations of `names` that the linked program kept. */
export function uniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]): Map<string, WebGLUniformLocation> {
	const locations = new Map<string, WebGLUniformLocation>();
	for (const name of names) {
		const location = gl.getUniformLocation(program, name);
		if (location)
			locations.set(name, location);
	}
	return locations;
}
