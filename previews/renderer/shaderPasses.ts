// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { link, uniformLocations } from './glProgram';
import type { ShaderBufferName, ShaderEntry, ShaderPass } from './types';
import { wrapPasses } from './wrappers';

export const SPECTRUM_WIDTH = 512;
export const SPECTRUM_ROWS = 2;

export type BufferFormat = 'RGBA16F' | 'RGBA8';
export type Locations = ReadonlyMap<string, WebGLUniformLocation>;

interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

/** `front` is the last finished output; the pass renders into the other target, then they swap. */
interface Buffer { targets: [Target, Target]; front: 0 | 1 }

interface PassProgram {
	name: ShaderBufferName | 'image';
	channels: ShaderPass['channels'];
	program: WebGLProgram;
	locations: Locations;
}

export interface PassHost {
	/** The format of the buffer textures, known after the first render. */
	readonly format: BufferFormat;
	/** Renders bufferA to bufferD in order, then the image, at `width` x `height` pixels. */
	render: (width: number, height: number, spectrum: WebGLTexture, setUniforms: (locations: Locations) => void) => void;
	dispose: () => void;
}

/** Compiles every pass of a multi-pass entry, or returns null (and frees what it made) when one fails. */
export function createPassHost(gl: WebGL2RenderingContext, entry: ShaderEntry): PassHost | null {
	const programs: PassProgram[] = [];
	for (const pass of wrapPasses(entry)) {
		const program = link(gl, pass.vertex, pass.fragment);
		if (!program) {
			for (const made of programs)
				gl.deleteProgram(made.program);
			return null;
		}
		programs.push({ name: pass.name, channels: pass.channels, program, locations: uniformLocations(gl, program, pass.uniforms) });
	}

	const buffers = new Map<string, Buffer>();
	const floatBuffers = gl.getExtension('EXT_color_buffer_float') !== null;
	let format: BufferFormat = floatBuffers ? 'RGBA16F' : 'RGBA8';
	let width = 0;
	let height = 0;
	let disposed = false;

	function makeTarget(): Target {
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const framebuffer = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		return { texture, framebuffer };
	}

	/** Gives every buffer texture the new size and format; the contents start empty. */
	function specify(candidate: BufferFormat): boolean {
		let complete = true;
		for (const buffer of buffers.values()) {
			for (const target of buffer.targets) {
				gl.bindTexture(gl.TEXTURE_2D, target.texture);
				if (candidate === 'RGBA16F')
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
				else
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
				complete = complete && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
			}
		}
		return complete;
	}

	function resize(nextWidth: number, nextHeight: number): boolean {
		width = nextWidth;
		height = nextHeight;
		if (buffers.size === 0) {
			for (const { name } of programs) {
				if (name !== 'image')
					buffers.set(name, { targets: [makeTarget(), makeTarget()], front: 0 });
			}
		}
		for (const buffer of buffers.values())
			buffer.front = 0;
		if (format === 'RGBA16F' && specify('RGBA16F'))
			return true;
		format = 'RGBA8';
		return specify('RGBA8');
	}

	function bindChannels(pass: PassProgram, spectrum: WebGLTexture): void {
		const sizes = new Float32Array(12);
		for (let channel = 0; channel < 4; channel++) {
			const source = pass.channels[channel as 0 | 1 | 2 | 3];
			const buffer = source && source !== 'music' ? buffers.get(source) : undefined;
			gl.activeTexture(gl.TEXTURE0 + channel);
			gl.bindTexture(gl.TEXTURE_2D, buffer ? buffer.targets[buffer.front].texture : spectrum);
			sizes.set(buffer ? [width, height, 1] : [SPECTRUM_WIDTH, SPECTRUM_ROWS, 1], channel * 3);
			const sampler = pass.locations.get(`iChannel${channel}`);
			if (sampler)
				gl.uniform1i(sampler, channel);
		}
		const resolution = pass.locations.get('iChannelResolution');
		if (resolution)
			gl.uniform3fv(resolution, sizes);
	}

	return {
		get format() {
			return format;
		},
		render(nextWidth, nextHeight, spectrum, setUniforms) {
			if (disposed || nextWidth <= 0 || nextHeight <= 0)
				return;
			if ((nextWidth !== width || nextHeight !== height) && !resize(nextWidth, nextHeight))
				throw new Error('the buffer framebuffers are incomplete');

			for (const pass of programs) {
				const buffer = pass.name === 'image' ? undefined : buffers.get(pass.name);
				gl.bindFramebuffer(gl.FRAMEBUFFER, buffer ? buffer.targets[buffer.front === 0 ? 1 : 0].framebuffer : null);
				gl.viewport(0, 0, width, height);
				gl.useProgram(pass.program);
				bindChannels(pass, spectrum);
				setUniforms(pass.locations);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				if (buffer)
					buffer.front = buffer.front === 0 ? 1 : 0;
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		},
		dispose() {
			if (disposed)
				return;
			disposed = true;
			for (const buffer of buffers.values()) {
				for (const target of buffer.targets) {
					gl.deleteFramebuffer(target.framebuffer);
					gl.deleteTexture(target.texture);
				}
			}
			buffers.clear();
			for (const pass of programs)
				gl.deleteProgram(pass.program);
		},
	};
}
