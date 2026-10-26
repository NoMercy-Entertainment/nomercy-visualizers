// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { parse } from '@shaderfrog/glsl-parser/index.js';
import preprocess from '@shaderfrog/glsl-parser/preprocessor/index.js';

// Build time only (the drop-in script and the tests). The app never imports this file.

function parseProgram(source: string, stage: 'fragment' | 'vertex', failOnWarn: boolean): void {
	parse(preprocess(source, {}), { stage, quiet: true, failOnWarn });
}

function firstLine(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split('\n')[0]!.replace(/^Error: */, '').trim() || 'the shader does not parse';
}

/** Returns null when the program parses, or the parser's first error line. */
export function checkProgram(source: string, stage: 'fragment' | 'vertex'): string | null {
	try {
		parseProgram(source, stage, true);
		return null;
	}
	catch (error) {
		// The parser misses a name declared earlier in the same comma list (`vec2 r=..., C=r;`),
		// so an undefined name that the source assigns is checked for syntax only.
		const name = /undefined variable: "(\w+)"/.exec(firstLine(error))?.[1];
		if (!name || !new RegExp(`\\b${name}\\s*=[^=]`).test(source))
			return firstLine(error);
		try {
			parseProgram(source, stage, false);
			return null;
		}
		catch (syntaxError) {
			return firstLine(syntaxError);
		}
	}
}
