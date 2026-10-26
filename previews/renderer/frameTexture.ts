// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/** Linear resample of `source` into `target`, end points included. */
function resampleRow(source: ArrayLike<number>, target: Uint8Array): void {
	const width = target.length;
	const count = source.length;
	if (count === 0) {
		target.fill(0);
		return;
	}
	if (width === 1 || count === 1) {
		target.fill(source[0] ?? 0);
		return;
	}
	const step = (count - 1) / (width - 1);
	for (let i = 0; i < width; i++) {
		const position = i * step;
		const index = Math.min(Math.floor(position), count - 2);
		const fraction = position - index;
		const from = source[index] ?? 0;
		const to = source[index + 1] ?? 0;
		target[i] = Math.round(from + (to - from) * fraction);
	}
}

/**
 * A `width x rows` single-channel byte texture (R8) for per-frame data such as
 * the frequency row and the waveform row. Each uploaded row is resampled to
 * `width`, so the shader samples a fixed width whatever the analyser size.
 *
 * Knows nothing about shaders. Sampling row `n` at v = (n + 0.5) / rows gives
 * its value as `texture(...).r` in 0..1.
 */
export class FrameDataTexture {
	readonly texture: WebGLTexture | null;
	private readonly _pixels: Uint8Array;
	private _disposed = false;

	constructor(private readonly gl: WebGL2RenderingContext, readonly width: number, readonly rows: number) {
		this._pixels = new Uint8Array(width * rows);
		this.texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, rows, 0, gl.RED, gl.UNSIGNED_BYTE, this._pixels);
	}

	/**
	 * Writes `data[n]` into row `n` (resampled to `width`) and uploads the whole
	 * texture. Rows beyond `data.length` keep their last values. Leaves the
	 * texture bound to `TEXTURE_2D` on the active unit.
	 */
	upload(data: ReadonlyArray<ArrayLike<number>>): void {
		if (this._disposed || !this.texture)
			return;
		const count = Math.min(data.length, this.rows);
		for (let row = 0; row < count; row++)
			resampleRow(data[row]!, this._pixels.subarray(row * this.width, (row + 1) * this.width));

		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.rows, gl.RED, gl.UNSIGNED_BYTE, this._pixels);
	}

	/** Deletes the GL texture. Idempotent. */
	dispose(): void {
		if (this._disposed)
			return;
		this._disposed = true;
		if (this.texture)
			this.gl.deleteTexture(this.texture);
	}
}
