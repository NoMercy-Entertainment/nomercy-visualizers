// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

// Build time only: scripts/build-milkdrop-presets.mjs loads this file; the app never imports it.

export type ShaderSlot = 'warp' | 'comp';

/** The three steps of `milkdrop-preset-converter` `convertShader`, so the HLSL can be changed between them. */
export interface HlslTools {
	prepareShader: (hlsl: string) => string;
	/** hlslparser-js `convertHLSLShader(source, entry, 'fs')`; throws when it cannot parse. */
	parseHlsl: (hlsl: string, entry: string) => Promise<string>;
	finish: (glsl: string) => string;
}

const ENTRY = 'main_shader_sentinel';

// Binary operators by C precedence, higher binds tighter.
const PRECEDENCE: Record<string, number> = {
	'*': 10,
	'/': 10,
	'%': 10,
	'+': 9,
	'-': 9,
	'<<': 8,
	'>>': 8,
	'<': 7,
	'>': 7,
	'<=': 7,
	'>=': 7,
	'==': 6,
	'!=': 6,
	'&': 5,
	'^': 4,
	'|': 3,
	'&&': 2,
	'||': 1,
};
const PREFIX_ONLY = new Set(['!', '~']);
const INCREMENT = new Set(['++', '--']);
// Ends a run of operands: each side is its own expression.
const SEPARATORS = new Set([',', ';', '{', '}', '?', ':', '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const KEYWORD_SEPARATORS = new Set(['return', 'else', 'do']);
const CAST_TYPE = /^(?:unsigned\s+)?(?:float|int|uint|half|bool|double)(?:[1-4](?:x[1-4])?)?$/;
const OPERATORS = ['<<=', '>>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>'];

interface Token {
	kind: 'atom' | 'member' | 'op' | 'punct';
	text: string;
}

const NUMBER = /^(?:0x[0-9a-f]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[fhlu]?)/i;
const IDENT = /^[A-Z_]\w*/i;
const MEMBER = /^\.[A-Z_]\w*/i;

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let rest = text;
	while (rest.length > 0) {
		const space = /^\s+/.exec(rest);
		if (space) {
			rest = rest.slice(space[0].length);
			continue;
		}
		const previous = tokens[tokens.length - 1];
		const afterOperand = previous !== undefined && (previous.kind === 'atom' || previous.kind === 'member' || previous.text === ')' || previous.text === ']');
		const member = afterOperand ? MEMBER.exec(rest)?.[0] : undefined;
		const word = member ?? NUMBER.exec(rest)?.[0] ?? IDENT.exec(rest)?.[0];
		if (word !== undefined) {
			tokens.push({ kind: member !== undefined ? 'member' : 'atom', text: word });
			rest = rest.slice(word.length);
			continue;
		}
		const operator = OPERATORS.find(candidate => rest.startsWith(candidate));
		const text = operator ?? rest[0];
		tokens.push({ kind: operator !== undefined || '+-*/%<>&|^!~=?:'.includes(text) ? 'op' : 'punct', text });
		rest = rest.slice(text.length);
	}
	return tokens;
}

interface Piece {
	text: string;
	kind: Token['kind'];
	/** A parenthesized type name: the operand after it is the cast value, also when it starts with "-". */
	cast?: boolean;
}

type Node = string | { op: string; left: Node; right: Node };

function render(node: Node): string {
	if (typeof node === 'string')
		return node;
	const side = (child: Node) => (typeof child === 'string' ? child : `(${render(child)})`);
	return `${side(node.left)} ${node.op} ${side(node.right)}`;
}

/** One run of operands and operators between two separators, with every binary operator grouped. */
function renderRun(run: Piece[]): string {
	const operands: string[] = [];
	const operators: string[] = [];
	let current: string[] = [];
	let expectOperand = true;
	for (const piece of run) {
		if (piece.kind === 'member') {
			current[current.length - 1] = `${current[current.length - 1] ?? ''}${piece.text}`;
			continue;
		}
		if (piece.kind === 'op') {
			if (INCREMENT.has(piece.text) && !expectOperand) {
				current[current.length - 1] += piece.text;
			}
			else if (expectOperand || PREFIX_ONLY.has(piece.text) || INCREMENT.has(piece.text)) {
				current.push(piece.text);
			}
			else if (PRECEDENCE[piece.text] !== undefined) {
				operands.push(current.join(' '));
				current = [];
				operators.push(piece.text);
				expectOperand = true;
			}
			else {
				return run.map(item => item.text).join(' ');
			}
			continue;
		}
		current.push(piece.text);
		expectOperand = piece.cast === true;
	}
	operands.push(current.join(' '));
	if (operators.length === 0)
		return operands[0];
	if (expectOperand || operands.length !== operators.length + 1)
		return run.map(item => item.text).join(' ');

	let nextOperand = 0;
	let nextOperator = 0;
	const parse = (minimum: number): Node => {
		let left: Node = operands[nextOperand++];
		while (nextOperator < operators.length && PRECEDENCE[operators[nextOperator]] >= minimum) {
			const op = operators[nextOperator++];
			const right = parse(PRECEDENCE[op] + 1);
			left = { op, left, right };
		}
		return left;
	};
	return render(parse(1));
}

class Unbalanced extends Error {}

function group(tokens: Token[], from: number, closer: string | null): { text: string; next: number } {
	let out = '';
	let run: Piece[] = [];
	const flush = () => {
		out += renderRun(run);
		run = [];
	};
	let i = from;
	while (i < tokens.length) {
		const token = tokens[i];
		if (closer !== null && token.text === closer) {
			flush();
			return { text: out, next: i + 1 };
		}
		if (token.text === ')' || token.text === ']')
			throw new Unbalanced();
		if (token.text === '(' || token.text === '[') {
			const close = token.text === '(' ? ')' : ']';
			const inner = group(tokens, i + 1, close);
			run.push({ kind: 'atom', text: `${token.text}${inner.text}${close}`, cast: token.text === '(' && CAST_TYPE.test(inner.text.trim()) });
			i = inner.next;
			continue;
		}
		if ((token.kind === 'op' || token.kind === 'punct') && SEPARATORS.has(token.text)) {
			flush();
			out += token.text === ';' || token.text === '{' || token.text === '}' ? `${token.text}\n` : ` ${token.text} `;
		}
		else if (token.kind === 'atom' && KEYWORD_SEPARATORS.has(token.text)) {
			flush();
			out += `${token.text} `;
		}
		else {
			run.push({ kind: token.kind, text: token.text });
		}
		i++;
	}
	if (closer !== null)
		throw new Unbalanced();
	flush();
	return { text: out, next: i };
}

function groupCode(code: string): string {
	return group(tokenize(code), 0, null).text;
}

const DEFINE = /^(\s*#\s*define\s+\w+(?:\([^)]*\))?)(?:\s(.*))?$/;

/**
 * Wraps every binary operation that has a binary operand in parentheses: `a*b + c` becomes `(a * b) + c`.
 * hlslparser-js turns the second and later operator of an unparenthesized chain into `&&`. Returns the
 * input unchanged when its brackets do not balance.
 */
export function groupHlslOperators(source: string): string {
	const lines = stripComments(source).replace(/\\\r?\n/g, ' ').split(/\r?\n/);
	const out: string[] = [];
	let code: string[] = [];
	const flushCode = () => {
		if (code.length > 0)
			out.push(groupCode(code.join('\n')));
		code = [];
	};
	try {
		for (const line of lines) {
			if (!line.trimStart().startsWith('#')) {
				code.push(line);
				continue;
			}
			flushCode();
			const define = DEFINE.exec(line);
			out.push(define?.[2] ? `${define[1]} ${groupCode(define[2]).replace(/\s*\n\s*/g, ' ').trim()}` : line);
		}
		flushCode();
	}
	catch (error) {
		if (error instanceof Unbalanced)
			return source;
		throw error;
	}
	return out.join('\n');
}

/** The converter keeps `&&` and `||` only where the HLSL had them; any extra one stands for a lost operator. */
export function assertOperatorsKept(hlsl: string, glsl: string): void {
	const count = (text: string) => (text.match(/&&|\|\|/g) ?? []).length;
	if (count(glsl) > count(hlsl))
		throw new Error(`operator lost: the GLSL has ${count(glsl)} && or || and the HLSL ${count(hlsl)}`);
}

/** A sampler declared without `uniform` does not compile, and Butterchurn finds user textures by `uniform sampler2D sampler_*`. */
export function declareSamplersUniform(glsl: string): string {
	return glsl.replace(/^(\s*)(sampler[23]D\s+sampler_\w+\s*;)/gm, '$1uniform $2');
}

// HLSL has these as globals. Butterchurn declares them inside main() only, so the converted function needs them as parameters.
// `warpArgument` is what the warp shader passes: null when warp already sees the name as a global.
const SHADER_LOCALS: Array<{ name: string; type: string; warpArgument: string | null }> = [
	{ name: 'rad', type: 'float', warpArgument: 'rad' },
	{ name: 'ang', type: 'float', warpArgument: 'ang' },
	{ name: 'uv_orig', type: 'vec2', warpArgument: null },
	{ name: 'hue_shader', type: 'vec3', warpArgument: 'vec3(1.0)' },
];

/** Adds the parameters of the converted function, and the arguments of its call, for each local the function uses without declaring it. */
export function passShaderLocals(glsl: string, slot: ShaderSlot): string {
	const signature = `vec4 ${ENTRY}(vec2 uv)`;
	const start = glsl.indexOf(`${signature} {`);
	const end = glsl.indexOf(' shader_body {', start);
	if (start === -1 || end === -1)
		return glsl;
	const body = glsl.slice(start + signature.length, end);
	const params: string[] = [];
	const args: string[] = [];
	for (const local of SHADER_LOCALS) {
		const argument = slot === 'warp' ? local.warpArgument : local.name;
		const declared = new RegExp(`\\b(?:float|int|bool|uint|[iub]?vec[234])\\s+${local.name}\\b`).test(body);
		if (argument === null || declared || !new RegExp(`\\b${local.name}\\b`).test(body))
			continue;
		params.push(`${local.type} ${local.name}`);
		args.push(argument);
	}
	if (params.length === 0)
		return glsl;
	const head = `${glsl.slice(0, start)}vec4 ${ENTRY}(vec2 uv, ${params.join(', ')})${glsl.slice(start + signature.length, end)}`;
	return head + glsl.slice(end).replace(`${ENTRY}(uv)`, `${ENTRY}(uv, ${args.join(', ')})`);
}

/** HLSL of one milkdrop shader to the GLSL text Butterchurn takes. */
export async function convertMilkShader(hlsl: string, slot: ShaderSlot, tools: HlslTools): Promise<string> {
	if (hlsl.trim() === '')
		return '';
	const prepared = tools.prepareShader(hlsl).replace('float4 shader_body (', `float4 ${ENTRY} (`);
	const glsl = tools.finish(await tools.parseHlsl(groupHlslOperators(prepared), ENTRY));
	assertOperatorsKept(hlsl, glsl);
	return declareSamplersUniform(passShaderLocals(glsl, slot));
}
