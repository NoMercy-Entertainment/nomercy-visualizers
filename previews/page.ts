// Runs inside headless Chromium. The shader loop follows app-web's ShaderVisualization.draw, with the
// player plugin left out; the MilkDrop loop follows MilkdropVisualization.draw.
import butterchurn from 'butterchurn';
import type { ShaderEntry, WrappedShaderFormat } from '../packages/converters/src/types';
import { FrameDataTexture } from './renderer/frameTexture';
import { link, uniformLocations } from './renderer/glProgram';
import { createKodeLifeHost } from './renderer/kodeLifeHost';
import type { KodeLifeHost } from './renderer/kodeLifeHost';
import { createMusicMapper } from './renderer/musicMapping';
import type { MusicUniforms } from './renderer/musicMapping';
import { createPassHost, SPECTRUM_ROWS, SPECTRUM_WIDTH } from './renderer/shaderPasses';
import type { Locations, PassHost } from './renderer/shaderPasses';
import { shaderInputs, wrapShader } from './renderer/wrappers';

interface Frame {
	frequency: number[];
	waveform: number[];
	deltaMs: number;
	energy: number;
	bandEnergies: { bass: number; mid: number; treble: number };
}

interface Size { width: number; height: number }

const setFloat = (gl: WebGL2RenderingContext, locations: Locations, name: string, value: number): void => {
	const location = locations.get(name);
	if (location)
		gl.uniform1f(location, value);
};

const setInt = (gl: WebGL2RenderingContext, locations: Locations, name: string, value: number): void => {
	const location = locations.get(name);
	if (location)
		gl.uniform1i(location, value);
};

function feedMusic(gl: WebGL2RenderingContext, locations: Locations, music: MusicUniforms): void {
	setFloat(gl, locations, 'uBass', music.uBass);
	setFloat(gl, locations, 'uMid', music.uMid);
	setFloat(gl, locations, 'uTreble', music.uTreble);
	setFloat(gl, locations, 'uEnergy', music.uEnergy);
	setFloat(gl, locations, 'uBeat', music.uBeat);
	setFloat(gl, locations, 'uBpm', music.uBpm);
	setFloat(gl, locations, 'uZoom', music.uZoom);
	setFloat(gl, locations, 'uGrade', music.uGrade);
}

/** Returns one PNG data URL per captured frame, or throws when the shader does not compile. */
async function renderShader(shader: ShaderEntry, frames: Frame[], every: number, size: Size): Promise<string[]> {
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
	if (!gl)
		throw new Error('webgl2-unavailable');

	let host: PassHost | null = null;
	let kode: KodeLifeHost | null = null;
	let program: WebGLProgram | null = null;
	let locations: Locations = new Map();
	const inputs = shaderInputs[shader.format as WrappedShaderFormat];

	if (shader.kodePasses) {
		kode = createKodeLifeHost(gl, shader);
		if (!kode)
			throw new Error('shader-compile-failed');
	}
	else if (shader.passes) {
		host = createPassHost(gl, shader);
		if (!host)
			throw new Error('shader-compile-failed');
	}
	else {
		const wrapped = wrapShader(shader);
		program = link(gl, wrapped.vertex, wrapped.fragment);
		if (!program)
			throw new Error('shader-compile-failed');
		const names = [...wrapped.uniforms, inputs.resolution.name, inputs.time, inputs.frame.name];
		if (inputs.delta)
			names.push(inputs.delta);
		locations = uniformLocations(gl, program, names);
	}
	const spectrum = kode ? null : new FrameDataTexture(gl, SPECTRUM_WIDTH, SPECTRUM_ROWS);

	const mapper = createMusicMapper();
	const out: string[] = [];
	const { width, height } = size;
	for (let index = 0; index < frames.length; index++) {
		const frame = frames[index]!;
		const music = mapper.step(frame);
		const feed = (target: Locations): void => {
			const resolution = target.get(inputs.resolution.name);
			if (resolution) {
				if (inputs.resolution.type === 'vec3')
					gl.uniform3f(resolution, width, height, 1);
				else
					gl.uniform2f(resolution, width, height);
			}
			setFloat(gl, target, inputs.time, music.time);
			if (inputs.delta)
				setFloat(gl, target, inputs.delta, frame.deltaMs / 1000);
			if (inputs.frame.type === 'int')
				setInt(gl, target, inputs.frame.name, index);
			else
				setFloat(gl, target, inputs.frame.name, index);
			feedMusic(gl, target, music);
		};
		const bytes = [Uint8Array.from(frame.frequency), Uint8Array.from(frame.waveform)];

		if (kode) {
			kode.render(width, height, bytes[0]!, (target) => {
				setFloat(gl, target, 'time', music.time);
				feedMusic(gl, target, music);
			});
		}
		else if (host) {
			spectrum!.upload(bytes);
			host.render(width, height, spectrum!.texture!, feed);
		}
		else {
			spectrum!.upload(bytes);
			gl.viewport(0, 0, width, height);
			gl.useProgram(program);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, spectrum!.texture);
			feed(locations);
			setInt(gl, locations, 'uSpectrum', 0);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		if (index % every === 0)
			out.push(canvas.toDataURL('image/png'));
	}
	gl.getExtension('WEBGL_lose_context')?.loseContext();
	return out;
}

function loadImage(data: string): Promise<{ data: string; width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve({ data, width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => reject(new Error(`texture failed to load`));
		image.src = data;
	});
}

async function renderMilkdrop(preset: unknown, textures: Record<string, string>, frames: Frame[], every: number, size: Size): Promise<string[]> {
	const output = document.createElement('canvas');
	output.width = size.width;
	output.height = size.height;
	document.body.appendChild(output);
	const viz = butterchurn.createVisualizer(null, output, { width: size.width, height: size.height, pixelRatio: 1, onlyUseWASM: true });

	const images: Record<string, { data: string; width: number; height: number }> = {};
	for (const [name, data] of Object.entries(textures))
		images[name] = await loadImage(data);
	if (Object.keys(images).length > 0)
		viz.loadExtraImages(images);
	await viz.loadPreset(preset, 0);

	// Butterchurn reads 1024 time-domain bytes; the left, right and mono arrays are one array.
	const out: string[] = [];
	for (let index = 0; index < frames.length; index++) {
		const frame = frames[index]!;
		const samples = Uint8Array.from(frame.waveform);
		viz.render({ audioLevels: { timeByteArray: samples, timeByteArrayL: samples, timeByteArrayR: samples }, elapsedTime: frame.deltaMs / 1000 });
		if (index % every === 0)
			out.push(output.toDataURL('image/png'));
	}
	viz.loseGLContext();
	output.remove();
	return out;
}

(window as unknown as { nmPreview: unknown }).nmPreview = { renderShader, renderMilkdrop };
