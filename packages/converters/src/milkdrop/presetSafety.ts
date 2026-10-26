// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

const CODE_SUFFIX = '_eqs_str';

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The first `*_eqs_str` key holding anything but empty text. Butterchurn compiles these with `new Function`. */
function codeKey(fields: Fields): string | null {
	for (const key of Object.keys(fields)) {
		const value = fields[key];
		if (key.endsWith(CODE_SUFFIX) && value !== '' && value !== null && value !== undefined)
			return key;
	}
	return null;
}

/**
 * Why a Butterchurn preset must not reach the player, or `null` when it is safe. Butterchurn runs `useJS` and
 * `*_eqs_str` text as JavaScript; only the EEL fields go through its WebAssembly sandbox.
 */
export function presetProblem(preset: unknown): string | null {
	if (!isFields(preset))
		return 'not an object';
	if ('useJS' in preset)
		return 'useJS';
	const top = codeKey(preset);
	if (top)
		return top;
	for (const group of ['shapes', 'waves'] as const) {
		const slots = preset[group];
		if (!Array.isArray(slots))
			continue;
		for (const [index, slot] of slots.entries()) {
			const key = isFields(slot) ? codeKey(slot) : null;
			if (key)
				return `${group}[${index}].${key}`;
		}
	}
	return Object.hasOwn(preset, 'init_eqs_eel') ? null : 'init_eqs_eel missing';
}
