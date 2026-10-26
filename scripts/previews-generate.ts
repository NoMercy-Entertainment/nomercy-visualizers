import { createHash } from 'node:crypto';
import process from 'node:process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import sharp from 'sharp';
import {
	CAPTURE_EVERY,
	PREVIEW_FPS,
	PREVIEW_HEIGHT,
	PREVIEW_SECONDS,
	PREVIEW_WIDTH,
	SIM_FPS,
	syntheticFrames,
} from './previews-lib';
import type { PreviewItem, PreviewResult } from './previews-lib';

export type { PreviewResult } from './previews-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_QUALITY = 80;
// Tuned against the 40 MB budget for the animated total; see the commit message.
const ANIMATED_QUALITY = Number(process.env.NM_PREVIEW_QUALITY ?? 13);
const FRAME_DELAY_MS = Math.round(1000 / PREVIEW_FPS);
const STATIC_FRAME = Math.floor((PREVIEW_FPS * PREVIEW_SECONDS) / 2);
const PAGES = Number(process.env.NM_PREVIEW_PAGES ?? 8);
const SIZE ={ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };

interface NmPreview {
	renderShader: (entry: unknown, frames: unknown, every: number, size: typeof SIZE) => Promise<string[]>;
	renderMilkdrop: (preset: unknown, textures: unknown, frames: unknown, every: number, size: typeof SIZE) => Promise<string[]>;
}

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#26303d"/><stop offset="1" stop-color="#0d1117"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g fill="none" stroke="#3b4a5c" stroke-width="3"><circle cx="160" cy="90" r="26"/><circle cx="160" cy="90" r="46"/><circle cx="160" cy="90" r="66"/></g></svg>`;

async function toPixels(dataUrl: string): Promise<Buffer> {
	const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
	return sharp(png).removeAlpha().raw().toBuffer();
}

const encodeStill = (pixels: Buffer): Promise<Buffer> =>
	sharp(pixels, { raw: { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, channels: 3 } }).webp({ quality: STATIC_QUALITY, effort: 6 }).toBuffer();

const encodeAnimated = (frames: Buffer[]): Promise<Buffer> =>
	sharp(Buffer.concat(frames), { raw: { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT * frames.length, channels: 3, pageHeight: PREVIEW_HEIGHT } })
		.webp({ quality: ANIMATED_QUALITY, effort: 6, loop: 0, delay: frames.map(() => FRAME_DELAY_MS) })
		.toBuffer();

/** A frame set that never leaves black has failed to draw. */
const isBlank = (frames: Buffer[]): boolean => frames.every(pixels => pixels.every(value => value < 8));

async function pageWithRenderer(browser: Browser): Promise<Page> {
	const bundle = await build({
		entryPoints: [join(root, 'previews', 'page.ts')],
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		target: 'chrome110',
		logLevel: 'error',
	});
	const page = await browser.newPage();
	await page.setContent('<!doctype html><body></body>');
	await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
	return page;
}

/** Renders every item and writes `<sha256 of the bytes>.webp` files into `outDir`. */
export async function generatePreviews(items: PreviewItem[], outDir: string): Promise<PreviewResult[]> {
	mkdirSync(outDir, { recursive: true });
	const write = (data: Buffer): string => {
		const name = `${sha256(data)}.webp`;
		if (!existsSync(join(outDir, name)))
			writeFileSync(join(outDir, name), data);
		return name;
	};

	const placeholderBytes = await sharp(Buffer.from(PLACEHOLDER_SVG)).webp({ quality: STATIC_QUALITY, effort: 6 }).toBuffer();
	const placeholder = write(placeholderBytes);
	const placeholderResult = (slug: string): PreviewResult =>
		({ slug, placeholder: true, preview_static: placeholder, preview_animated: placeholder, static_bytes: placeholderBytes.length, animated_bytes: placeholderBytes.length });

	const frames = syntheticFrames(SIM_FPS, PREVIEW_FPS * PREVIEW_SECONDS * (SIM_FPS / PREVIEW_FPS));
	async function renderItem(item: PreviewItem, page: Page): Promise<PreviewResult> {
		let urls: string[];
		try {
			urls = await page.evaluate(async ([work, simFrames, every, size]) => {
				const nm = (globalThis as unknown as { nmPreview: NmPreview }).nmPreview;
				return work.kind === 'shader'
					? nm.renderShader(work.entry, simFrames, every, size)
					: nm.renderMilkdrop(work.preset, work.textures, simFrames, every, size);
			}, [item.job!, frames, CAPTURE_EVERY, SIZE] as const);
		}
		catch (error) {
			console.warn(`${item.slug}: render failed (${(error as Error).message.split('\n')[0]}), using the placeholder`);
			return placeholderResult(item.slug);
		}
		const pixels = await Promise.all(urls.map(toPixels));
		if (isBlank(pixels)) {
			console.warn(`${item.slug}: every frame is black, using the placeholder`);
			return placeholderResult(item.slug);
		}
		const still = await encodeStill(pixels[Math.min(STATIC_FRAME, pixels.length - 1)]!);
		const moving = await encodeAnimated(pixels);
		return { slug: item.slug, placeholder: false, preview_static: write(still), preview_animated: write(moving), static_bytes: still.length, animated_bytes: moving.length };
	}

	const results: PreviewResult[] = items.map(item => placeholderResult(item.slug));
	const queue = items.map((item, index) => ({ item, index })).filter(({ item }) => item.job);
	if (queue.length === 0)
		return results;

	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
	try {
		const pages = await Promise.all(Array.from({ length: Math.min(PAGES, queue.length) }, () => pageWithRenderer(browser)));
		await Promise.all(pages.map(async (page) => {
			for (let next = queue.shift(); next; next = queue.shift())
				results[next.index] = await renderItem(next.item, page);
		}));
	}
	finally {
		await browser.close();
	}
	return results;
}
