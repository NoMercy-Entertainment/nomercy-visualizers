// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

/** The name of each `uniform sampler2D` a shader source declares, once. */
export function samplerNames(source: string): string[] {
	const names = new Set<string>();
	for (const match of source.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?sampler2D\s+(\w+)/g))
		names.add(match[1]!);
	return [...names];
}
