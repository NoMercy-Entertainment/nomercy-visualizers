// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { link, uniformLocations } from './glProgram';
import { samplerNames } from './glslSource';
import { cameraMatrix, IDENTITY_MATRIX } from './kodeLifeCamera';
import type { BufferFormat, Locations } from './shaderPasses';
import type { KodeLifePass, ShaderEntry } from './types';

export const SPECTRUM_SIDE = 16;
export const SPECTRUM_BINS = SPECTRUM_SIDE * SPECTRUM_SIDE;

const HISTORY = 'history';
const SPECTRUM = 'input_spectrum';
const UNIFORMS = ['time', 'resolution', 'mvp', 'uBass', 'uMid', 'uTreble', 'uEnergy', 'uBeat', 'uBpm', 'uZoom'];
// Two triangles over clip space; a_position is vec4 at attribute 0.
const QUAD = Float32Array.of(-1, -1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 0, 1, 1, 1, 0, 1);

// The analyser byte window is -100..-30 dB: 255 is magnitude 1, and 20 dB is a factor of 10.
const ANALYSER_RANGE_DB = 70;

interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

/** `front` is the last finished output; the pass renders into the other target, then they swap. */
interface Buffer { targets: [Target, Target]; front: 0 | 1; fixed: boolean; depth?: WebGLRenderbuffer }

interface HostPass {
	pass: KodeLifePass;
	program: WebGLProgram;
	locations: Locations;
	samplers: string[];
	buffer?: Buffer;
}

export interface KodeLifeHost {
	/** The format of the buffer textures, known after the first render. */
	readonly format: BufferFormat;
	/** Renders every pass in order at `width` x `height` pixels; `setUniforms` feeds the time and the music. */
	render: (width: number, height: number, frequency: ArrayLike<number>, setUniforms: (locations: Locations) => void) => void;
	dispose: () => void;
}

/** An analyser byte as the linear magnitude KodeLife's Spectrum Full gives: 255 is 1, 0 is silence. */
function magnitude(byte: number): number {
	return byte <= 0 ? 0 : 10 ** (((Math.min(byte, 255) / 255) - 1) * (ANALYSER_RANGE_DB / 20));
}

/** The analyser row as 256 linear magnitudes: groups averaged when longer, stretched when shorter, silence when empty. */
export function spectrumBins(frequency: ArrayLike<number>): Float32Array {
	const bins = new Float32Array(SPECTRUM_BINS);
	const count = frequency.length;
	if (count === 0)
		return bins;
	for (let n = 0; n < SPECTRUM_BINS; n++) {
		if (count >= SPECTRUM_BINS) {
			const from = Math.floor((n * count) / SPECTRUM_BINS);
			const to = Math.max(from + 1, Math.floor(((n + 1) * count) / SPECTRUM_BINS));
			let sum = 0;
			for (let i = from; i < to; i++)
				sum += magnitude(frequency[i]!);
			bins[n] = sum / (to - from);
		}
		else {
			const position = (n * (count - 1)) / (SPECTRUM_BINS - 1);
			const index = Math.min(Math.floor(position), Math.max(count - 2, 0));
			const low = magnitude(frequency[index]!);
			const high = magnitude(frequency[Math.min(index + 1, count - 1)]!);
			bins[n] = low + (high - low) * (position - index);
		}
	}
	return bins;
}

/** GLSL ES wants `#version` on line 1: it goes there after the first line's comment, and its old line stays empty. */
export function versionFirst(source: string): string {
	const match = /^[ \t]*(#version[^\r\n]*)$/m.exec(source);
	if (!match || match.index === 0)
		return source;
	return `${match[1]} ${source.slice(0, match.index)}${source.slice(match.index + match[0].length)}`;
}

/** Compiles every pass of a KodeLife entry, or returns null (and frees what it made) when one fails. */
export function createKodeLifeHost(gl: WebGL2RenderingContext, entry: ShaderEntry): KodeLifeHost | null {
	const passes: HostPass[] = [];
	for (const pass of entry.kodePasses ?? []) {
		const program = link(gl, versionFirst(pass.vertex), versionFirst(pass.fragment), ['a_position']);
		if (!program) {
			for (const made of passes)
				gl.deleteProgram(made.program);
			return null;
		}
		const samplers = [...new Set([...samplerNames(pass.vertex), ...samplerNames(pass.fragment)])];
		passes.push({ pass, program, samplers, locations: uniformLocations(gl, program, [...UNIFORMS, ...samplers]) });
	}

	const quad = gl.createBuffer()!;
	const quadArray = gl.createVertexArray()!;
	gl.bindVertexArray(quadArray);
	gl.bindBuffer(gl.ARRAY_BUFFER, quad);
	gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);

	const spectrum = makeSpectrumTexture();
	const buffers = new Map<string, Buffer>();
	for (const host of passes) {
		if (host.pass.target !== 'screen') {
			const depth = host.pass.draw === 'fullscreen' ? undefined : makeDepth();
			host.buffer = { targets: [makeTarget(depth), makeTarget(depth)], front: 0, fixed: host.pass.target === 'spectrum', depth };
			buffers.set(host.pass.name, host.buffer);
		}
	}

	let format: BufferFormat = gl.getExtension('EXT_color_buffer_float') !== null ? 'RGBA16F' : 'RGBA8';
	let width = 0;
	let height = 0;
	let allocated = false;
	let disposed = false;

	function makeNearestTexture(): WebGLTexture {
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return texture;
	}

	/** The magnitudes are small floats: R32F, read with NEAREST (linear filtering of R32F needs an extension). */
	function makeSpectrumTexture(): WebGLTexture {
		const texture = makeNearestTexture();
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, SPECTRUM_SIDE, SPECTRUM_SIDE, 0, gl.RED, gl.FLOAT, null);
		return texture;
	}

	/** Binding makes the renderbuffer an object; a framebuffer refuses to attach it before. */
	function makeDepth(): WebGLRenderbuffer {
		const depth = gl.createRenderbuffer()!;
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		return depth;
	}

	function makeTarget(depth?: WebGLRenderbuffer): Target {
		const texture = makeNearestTexture();
		const framebuffer = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		if (depth)
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		return { texture, framebuffer };
	}

	/** Gives these buffers their size and format; the contents start empty. */
	function allocate(list: Buffer[], candidate: BufferFormat): boolean {
		let complete = true;
		for (const buffer of list) {
			const [w, h] = buffer.fixed ? [SPECTRUM_SIDE, SPECTRUM_SIDE] : [width, height];
			buffer.front = 0;
			if (buffer.depth) {
				gl.bindRenderbuffer(gl.RENDERBUFFER, buffer.depth);
				gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
			}
			for (const target of buffer.targets) {
				gl.bindTexture(gl.TEXTURE_2D, target.texture);
				if (candidate === 'RGBA16F')
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
				else
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
				complete = complete && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
			}
		}
		return complete;
	}

	/** The render-size buffers are cleared on every resize; the 16 x 16 history only on the first one. */
	function resize(nextWidth: number, nextHeight: number): boolean {
		width = nextWidth;
		height = nextHeight;
		const all = [...buffers.values()];
		const sized = allocated ? all.filter(buffer => !buffer.fixed) : all;
		allocated = true;
		if (format === 'RGBA16F') {
			if (allocate(sized, 'RGBA16F'))
				return true;
			format = 'RGBA8';
			return allocate(all, 'RGBA8');
		}
		return allocate(sized, 'RGBA8');
	}

	function bindSamplers(host: HostPass): void {
		host.samplers.forEach((name, unit) => {
			const source = name === HISTORY ? host.buffer : buffers.get(name);
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, name === SPECTRUM ? spectrum : source ? source.targets[source.front].texture : null);
			const location = host.locations.get(name);
			if (location)
				gl.uniform1i(location, unit);
		});
	}

	return {
		get format() {
			return format;
		},
		render(nextWidth, nextHeight, frequency, setUniforms) {
			if (disposed || nextWidth <= 0 || nextHeight <= 0)
				return;
			if ((nextWidth !== width || nextHeight !== height) && !resize(nextWidth, nextHeight))
				throw new Error('the buffer framebuffers are incomplete');

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, spectrum);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPECTRUM_SIDE, SPECTRUM_SIDE, gl.RED, gl.FLOAT, spectrumBins(frequency));

			gl.clearColor(0, 0, 0, 0);
			for (const host of passes) {
				const { pass, buffer, locations } = host;
				const [targetWidth, targetHeight] = pass.target === 'spectrum' ? [SPECTRUM_SIDE, SPECTRUM_SIDE] : [width, height];
				gl.bindFramebuffer(gl.FRAMEBUFFER, buffer ? buffer.targets[buffer.front === 0 ? 1 : 0].framebuffer : null);
				gl.viewport(0, 0, targetWidth, targetHeight);
				if (buffer?.depth) {
					gl.enable(gl.DEPTH_TEST);
					gl.depthFunc(gl.LESS);
					gl.depthMask(true);
					gl.clearDepth(1);
					gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				}
				else {
					gl.clear(gl.COLOR_BUFFER_BIT);
				}
				gl.useProgram(host.program);
				bindSamplers(host);

				const resolution = locations.get('resolution');
				if (resolution)
					gl.uniform2f(resolution, targetWidth, targetHeight);
				const mvp = locations.get('mvp');
				if (mvp)
					gl.uniformMatrix4fv(mvp, false, pass.camera ? cameraMatrix(pass.camera, targetWidth / targetHeight) : IDENTITY_MATRIX);
				setUniforms(locations);

				if (pass.draw === 'fullscreen') {
					gl.bindVertexArray(quadArray);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
				else {
					gl.bindVertexArray(null);
					gl.drawArraysInstanced(gl[pass.draw.mode], 0, pass.draw.vertices, pass.draw.instances);
				}
				if (buffer?.depth)
					gl.disable(gl.DEPTH_TEST);
				if (buffer)
					buffer.front = buffer.front === 0 ? 1 : 0;
			}
			gl.bindVertexArray(null);
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
				if (buffer.depth)
					gl.deleteRenderbuffer(buffer.depth);
			}
			buffers.clear();
			gl.deleteTexture(spectrum);
			gl.deleteVertexArray(quadArray);
			gl.deleteBuffer(quad);
			for (const host of passes)
				gl.deleteProgram(host.program);
		},
	};
}
