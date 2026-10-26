// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { checkProgram } from './shaderCheck';

const program = (body: string): string => `#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){\n${body}\n}`;

describe('checkProgram', () => {
	it('accepts a declarator that reads an earlier one from the same comma list', () => {
		const source = program('vec2 r=vec2(2.0), C=r, p=(C+C-r)/r.y;\no=vec4(p,0,1);');
		expect(checkProgram(source, 'fragment')).toBeNull();
	});

	it('still refuses a name that is never declared or assigned', () => {
		const message = checkProgram(program('o=vec4(missing);'), 'fragment');
		expect(message).toContain('missing');
	});

	it('still refuses a syntax error next to a comma declaration', () => {
		expect(checkProgram(program('vec2 r=vec2(2.0), C=r;\no=vec4(C;'), 'fragment')).not.toBeNull();
	});
});
