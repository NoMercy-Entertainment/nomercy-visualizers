// Proves every shipped entry carries its credit and license.
// Shaders: name, author and license header lines (or kodelife.json fields).
// MilkDrop presets: an author, and a projectM source link pinned to one commit.
// Usage: node scripts/check-credits.mjs [repo dir]. Exit 0 = every entry covered.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.argv[2] ?? '.';
const gaps = [];

const shaderDir = join(root, 'shaders');
let shaders = 0;
for (const name of readdirSync(shaderDir)) {
	const path = join(shaderDir, name);
	let meta;
	if (statSync(path).isDirectory()) {
		const json = join(path, 'kodelife.json');
		if (!existsSync(json)) {
			gaps.push(`shader ${name}: no kodelife.json`);
			continue;
		}
		meta = JSON.parse(readFileSync(json, 'utf8'));
	}
	else if (name.endsWith('.glsl')) {
		const head = readFileSync(path, 'utf8').split(/\r?\n/).slice(0, 10).join('\n');
		meta = Object.fromEntries([...head.matchAll(/^\/\/ (\w+): (.+)$/gm)].map(m => [m[1], m[2].trim()]));
	}
	else {
		continue;
	}
	shaders++;
	for (const key of ['name', 'author', 'license']) {
		if (!meta[key])
			gaps.push(`shader ${name}: no ${key}`);
	}
}

const md = join(root, 'milkdrop');
const manifest = JSON.parse(readFileSync(join(md, 'manifest.json'), 'utf8'));
const rights = JSON.parse(readFileSync(join(md, 'rights.json'), 'utf8'));
if (!rights['projectm-presets'])
	gaps.push('rights.json: no projectm-presets notice');
for (const entry of manifest) {
	const file = join(md, 'presets', `${entry.id}.json`);
	if (!existsSync(file)) {
		gaps.push(`preset ${entry.id}: no file`);
		continue;
	}
	const { sourceUrl } = JSON.parse(readFileSync(file, 'utf8'));
	if (!/^https:\/\/github\.com\/projectM-visualizer\/[^/]+\/blob\/[0-9a-f]{40}\//.test(sourceUrl ?? ''))
		gaps.push(`preset ${entry.id}: no pinned source link`);
	if (!String(entry.author ?? '').trim())
		gaps.push(`preset ${entry.id}: no author`);
}

console.log(`shaders ${shaders}, presets ${manifest.length}, gaps ${gaps.length}`);
gaps.slice(0, 20).forEach(gap => console.log(`  ${gap}`));
process.exit(gaps.length ? 1 : 0);
