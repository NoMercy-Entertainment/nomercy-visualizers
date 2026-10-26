// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import type { ShaderChannelSource, ShaderEntry, ShaderFormat, ShaderPass, ShaderPassName } from './types';

export const SHADER_FORMATS: readonly ShaderFormat[] = [
	'twigl-classic',
	'twigl-geek',
	'twigl-geeker',
	'twigl-geekest',
	'shadertoy',
];

// The id becomes an i18n key and the synced `musicVisualizer` value (64 characters at most).
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RESERVED_IDS = new Set(['bars']);
const REQUIRED_KEYS = ['format', 'name', 'author', 'license'] as const;

const PASS_NAMES: readonly ShaderPassName[] = ['common', 'bufferA', 'bufferB', 'bufferC', 'bufferD', 'image'];
const CHANNEL_SOURCES: readonly string[] = ['music', 'bufferA', 'bufferB', 'bufferC', 'bufferD'];
const MARKER_START = /^\/\/ *pass *:/;
const MARKER = /^\/\/ *pass: *(\w+)(?: +channels:((?: +\d+=\w+)*))? *$/;

function parseChannels(pass: string, list: string): ShaderPass['channels'] {
	const channels: ShaderPass['channels'] = {};
	for (const pair of list.trim().split(/\s+/).filter(Boolean)) {
		const [index, source] = pair.split('=') as [string, string];
		if (!/^[0-3]$/.test(index))
			throw new Error(`pass "${pass}" has channel ${index}; a channel is 0 to 3`);
		if (!CHANNEL_SOURCES.includes(source))
			throw new Error(`pass "${pass}" channel ${index} reads "${source}"; use ${CHANNEL_SOURCES.join(', ')}`);
		channels[Number(index) as 0 | 1 | 2 | 3] = source as ShaderChannelSource;
	}
	return channels;
}

/** Splits the text after the header at its `// pass:` marker lines. */
function parsePasses(lines: string[]): ShaderPass[] {
	const starts = lines.flatMap((line, index) => (MARKER_START.test(line) ? [index] : []));
	if (lines.slice(0, starts[0]).join('\n').trim())
		throw new Error('the file has shader code before the first pass marker');

	const passes: ShaderPass[] = [];
	starts.forEach((start, position) => {
		const marker = MARKER.exec(lines[start]!.trimEnd());
		if (!marker)
			throw new Error(`pass marker "${lines[start]}" must look like "// pass: <name> channels: 0=music 1=bufferA"`);
		const name = marker[1] as ShaderPassName;
		if (!PASS_NAMES.includes(name))
			throw new Error(`unknown pass "${name}"; use ${PASS_NAMES.join(', ')}`);
		if (passes.some(pass => pass.name === name))
			throw new Error(`pass "${name}" appears twice`);
		if (name === 'common' && marker[2]?.trim())
			throw new Error('pass "common" takes no channels');
		const source = lines.slice(start + 1, starts[position + 1]).join('\n').trim();
		if (!source)
			throw new Error(`pass "${name}" has no source`);
		passes.push({ name, channels: parseChannels(name, marker[2] ?? ''), source });
	});

	if (!passes.some(pass => pass.name === 'image'))
		throw new Error('the file has pass markers but no "image" pass');
	for (const pass of passes) {
		for (const [index, source] of Object.entries(pass.channels)) {
			if (source !== 'music' && !passes.some(other => other.name === source))
				throw new Error(`pass "${pass.name}" channel ${index} reads ${source}, which has no pass`);
		}
	}
	return passes;
}

export function assertShaderId(id: string): void {
	if (!ID_PATTERN.test(id) || RESERVED_IDS.has(id))
		throw new Error(`id "${id}" must be lowercase letters, digits and hyphens, at most 64, and not "bars"`);
}

/** Leading `//` lines hold `key: value` pairs; the first other line starts the source (or `// pass:` markers). */
export function parseShaderFile(id: string, text: string): ShaderEntry {
	assertShaderId(id);

	const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	const header: Record<string, string> = {};
	let next = 0;
	while (next < lines.length && lines[next]!.startsWith('//')) {
		if (MARKER_START.test(lines[next]!))
			break;
		const pair = /^\/\/ *([a-z]+) *:(.*)$/.exec(lines[next]!);
		if (pair)
			header[pair[1]!] = pair[2]!.trim();
		next++;
	}

	for (const key of REQUIRED_KEYS) {
		if (!header[key])
			throw new Error(`header is missing "${key}:"`);
	}
	if (!SHADER_FORMATS.includes(header.format as ShaderFormat))
		throw new Error(`header format "${header.format}" must be one of ${SHADER_FORMATS.join(', ')}`);

	const rest = lines.slice(next);
	const entry = {
		id,
		format: header.format as ShaderFormat,
		name: header.name!,
		author: header.author!,
		license: header.license!,
	};
	if (rest.some(line => MARKER_START.test(line))) {
		if (entry.format !== 'shadertoy')
			throw new Error('pass markers need the shadertoy format');
		const passes = parsePasses(rest);
		return { ...entry, source: passes.find(pass => pass.name === 'image')!.source, passes };
	}

	const source = rest.join('\n').trim();
	if (!source)
		throw new Error('file has no shader source after the header');
	return { ...entry, source };
}
