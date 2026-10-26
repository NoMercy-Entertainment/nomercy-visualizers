// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment. All rights reserved.
//
//  This file is part of NoMercy and is proprietary and confidential.
//  Unauthorized copying, distribution, or use is prohibited. See LICENSE.
//
//  SPDX-License-Identifier: LicenseRef-NoMercy-Proprietary
// -----------------------------------------------------------------------------

import type { ShaderEntry, ShaderPass, ShaderPassName, WrappedShaderFormat } from './types';

// The geeker/geekest items and the noise helpers are copied from twigl (commit fc09f1ec) and
// need the notices below. The Shadertoy items are the declarations on its public how-to page.

export const TWIGL_NOTICE = `MIT License

Copyright (c) 2020 doxas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

// snoise2D, snoise3D, snoise4D, grad4, mod289, permute and taylorInvSqrt come from webgl-noise.
export const ASHIMA_NOTICE = `Array and textureless GLSL 2D/3D/4D simplex noise functions.
Author: Ian McEwan, Ashima Arts. https://github.com/ashima/webgl-noise

Copyright (C) 2011 by Ashima Arts (Simplex noise)
Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)

Distributed under the MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;

export type WrapperMode = 'classic' | 'geek' | 'geeker' | 'geekest' | 'shadertoy';
export type WrapperItemKind = 'version' | 'precision' | 'uniform' | 'texture' | 'define' | 'function' | 'output' | 'wrapper';

export interface WrapperItem {
	name: string;
	kind: WrapperItemKind;
	text: string;
}

// classic and geek: twigl adds nothing, so these are the uniforms it binds by name.
// Shadertoy: iFrame is an int there, and iChannel0 is the music spectrum texture.
export const wrapperItems: Record<WrapperMode, WrapperItem[]> = {
	classic: [
		{ name: 'resolution', kind: 'uniform', text: 'uniform vec2 resolution;' },
		{ name: 'mouse', kind: 'uniform', text: 'uniform vec2 mouse;' },
		{ name: 'time', kind: 'uniform', text: 'uniform float time;' },
		{ name: 'frame', kind: 'uniform', text: 'uniform float frame;' },
		{ name: 'sound', kind: 'uniform', text: 'uniform float sound;' },
		{ name: 'backbuffer', kind: 'texture', text: 'uniform sampler2D backbuffer;' },
	],
	geek: [
		{ name: 'r', kind: 'uniform', text: 'uniform vec2 r;' },
		{ name: 'm', kind: 'uniform', text: 'uniform vec2 m;' },
		{ name: 't', kind: 'uniform', text: 'uniform float t;' },
		{ name: 'f', kind: 'uniform', text: 'uniform float f;' },
		{ name: 's', kind: 'uniform', text: 'uniform float s;' },
		{ name: 'b', kind: 'texture', text: 'uniform sampler2D b;' },
	],
	geeker: [
		{ name: '#version 300 es', kind: 'version', text: '#version 300 es' },
		{ name: 'precision', kind: 'precision', text: 'precision highp float;' },
		{ name: 'r', kind: 'uniform', text: 'uniform vec2 r;' },
		{ name: 'm', kind: 'uniform', text: 'uniform vec2 m;' },
		{ name: 't', kind: 'uniform', text: 'uniform float t;' },
		{ name: 'f', kind: 'uniform', text: 'uniform float f;' },
		{ name: 's', kind: 'uniform', text: 'uniform float s;' },
		{ name: 'b', kind: 'texture', text: 'uniform sampler2D b;' },
		{ name: 'o', kind: 'output', text: 'out vec4 o;' },
	],
	geekest: [
		{ name: '#version 300 es', kind: 'version', text: '#version 300 es' },
		{ name: 'FC', kind: 'define', text: '#define FC gl_FragCoord' },
		{ name: 'precision', kind: 'precision', text: 'precision highp float;' },
		{ name: 'r', kind: 'uniform', text: 'uniform vec2 r;' },
		{ name: 'm', kind: 'uniform', text: 'uniform vec2 m;' },
		{ name: 't', kind: 'uniform', text: 'uniform float t;' },
		{ name: 'f', kind: 'uniform', text: 'uniform float f;' },
		{ name: 's', kind: 'uniform', text: 'uniform float s;' },
		{ name: 'b', kind: 'texture', text: 'uniform sampler2D b;' },
		{ name: 'F4', kind: 'define', text: '#define F4 0.309016994374947451' },
		{ name: 'mod289', kind: 'function', text: 'float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}' },
		{ name: 'mod289', kind: 'function', text: 'vec2  mod289(vec2 x) {return x - floor(x * (1.0 / 289.0)) * 289.0;}' },
		{ name: 'mod289', kind: 'function', text: 'vec3  mod289(vec3 x) {return x - floor(x * (1.0 / 289.0)) * 289.0;}' },
		{ name: 'mod289', kind: 'function', text: 'vec4  mod289(vec4 x) {return x - floor(x * (1.0 / 289.0)) * 289.0;}' },
		{ name: 'permute', kind: 'function', text: 'float permute(float x){return mod289(((x*34.0)+1.0)*x);}' },
		{ name: 'permute', kind: 'function', text: 'vec3  permute(vec3 x) {return mod289(((x*34.0)+1.0)*x);}' },
		{ name: 'permute', kind: 'function', text: 'vec4  permute(vec4 x) {return mod289(((x*34.0)+1.0)*x);}' },
		{ name: 'taylorInvSqrt', kind: 'function', text: 'float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}' },
		{ name: 'taylorInvSqrt', kind: 'function', text: 'vec4  taylorInvSqrt(vec4 r) {return 1.79284291400159 - 0.85373472095314 * r;}' },
		{ name: 'snoise2D', kind: 'function', text: `float snoise2D(vec2 v){
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  // First corner
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);

  // Other corners
  vec2 i1;
  //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
  //i1.y = 1.0 - i1.x;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  // x0 = x0 - 0.0 + 0.0 * C.xx ;
  // x1 = x0 - i1 + 1.0 * C.xx ;
  // x2 = x0 - 1.0 + 2.0 * C.xx ;
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  // Permutations
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  // Gradients: 41 points uniformly over a line, mapped onto a diamond.
  // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  // Normalize gradients implicitly by scaling m
  // Approximation of: m *= inversesqrt( a0*a0 + h*h );
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

  // Compute final noise value at P
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}` },
		{ name: 'snoise3D', kind: 'function', text: `float snoise3D(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalize gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}` },
		{ name: 'grad4', kind: 'function', text: `vec4 grad4(float j, vec4 ip){
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p,s;

  p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;

  return p;
}` },
		{ name: 'snoise4D', kind: 'function', text: `float snoise4D(vec4 v){
  const vec4  C = vec4( 0.138196601125011,  // (5 - sqrt(5))/20  G4
                        0.276393202250021,  // 2 * G4
                        0.414589803375032,  // 3 * G4
                       -0.447213595499958); // -1 + 4 * G4

  // First corner
  vec4 i  = floor(v + dot(v, vec4(F4)) );
  vec4 x0 = v -   i + dot(i, C.xxxx);

  // Other corners

  // Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
  vec4 i0;
  vec3 isX = step( x0.yzw, x0.xxx );
  vec3 isYZ = step( x0.zww, x0.yyz );
  //  i0.x = dot( isX, vec3( 1.0 ) );
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  //  i0.y += dot( isYZ.xy, vec2( 1.0 ) );
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  // i0 now contains the unique values 0,1,2,3 in each channel
  vec4 i3 = clamp( i0, 0.0, 1.0 );
  vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
  vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );

  //  x0 = x0 - 0.0 + 0.0 * C.xxxx
  //  x1 = x0 - i1  + 1.0 * C.xxxx
  //  x2 = x0 - i2  + 2.0 * C.xxxx
  //  x3 = x0 - i3  + 3.0 * C.xxxx
  //  x4 = x0 - 1.0 + 4.0 * C.xxxx
  vec4 x1 = x0 - i1 + C.xxxx;
  vec4 x2 = x0 - i2 + C.yyyy;
  vec4 x3 = x0 - i3 + C.zzzz;
  vec4 x4 = x0 + C.wwww;

  // Permutations
  i = mod289(i);
  float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute( permute( permute( permute (
             i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
           + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
           + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
           + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));

  // Gradients: 7x7x6 points over a cube, mapped onto a 4-cross polytope
  // 7*7*6 = 294, which is close to the ring size 17*17 = 289.
  vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;

  vec4 p0 = grad4(j0,   ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

  // Normalize gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4,p4));

  // Mix contributions from the five corners
  vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
                + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;
}` },
		{ name: 'fsnoise', kind: 'function', text: 'float fsnoise      (vec2 c){return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);}' },
		{ name: 'fsnoiseDigits', kind: 'function', text: 'float fsnoiseDigits(vec2 c){return fract(sin(dot(c, vec2(0.129898, 0.78233))) * 437.585453);}' },
		{ name: 'hsv', kind: 'function', text: `vec3 hsv(float h, float s, float v){
    vec4 t = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(vec3(h) + t.xyz) * 6.0 - vec3(t.w));
    return v * mix(vec3(t.x), clamp(p - vec3(t.x), 0.0, 1.0), s);
}` },
		{ name: 'rotate2D', kind: 'function', text: `mat2 rotate2D(float r){
    return mat2(cos(r), sin(r), -sin(r), cos(r));
}` },
		{ name: 'rotate3D', kind: 'function', text: `mat3 rotate3D(float angle, vec3 axis){
    vec3 a = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float r = 1.0 - c;
    return mat3(
        a.x * a.x * r + c,
        a.y * a.x * r + a.z * s,
        a.z * a.x * r - a.y * s,
        a.x * a.y * r - a.z * s,
        a.y * a.y * r + c,
        a.z * a.y * r + a.x * s,
        a.x * a.z * r + a.y * s,
        a.y * a.z * r - a.x * s,
        a.z * a.z * r + c
    );
}` },
		{ name: 'PI', kind: 'define', text: 'const float PI = 3.141592653589793;' },
		{ name: 'PI2', kind: 'define', text: 'const float PI2 = PI * 2.0;' },
		{ name: 'o', kind: 'output', text: 'out vec4 o;' },
		{ name: 'void main(){', kind: 'wrapper', text: `void main(){
` },
		{ name: '}', kind: 'wrapper', text: `
}` },
	],
	shadertoy: [
		{ name: 'iResolution', kind: 'uniform', text: 'uniform vec3 iResolution;' },
		{ name: 'iTime', kind: 'uniform', text: 'uniform float iTime;' },
		{ name: 'iTimeDelta', kind: 'uniform', text: 'uniform float iTimeDelta;' },
		{ name: 'iFrame', kind: 'uniform', text: 'uniform int iFrame;' },
		{ name: 'iChannelTime', kind: 'uniform', text: 'uniform float iChannelTime[4];' },
		{ name: 'iMouse', kind: 'uniform', text: 'uniform vec4 iMouse;' },
		{ name: 'iDate', kind: 'uniform', text: 'uniform vec4 iDate;' },
		{ name: 'iSampleRate', kind: 'uniform', text: 'uniform float iSampleRate;' },
		{ name: 'iChannelResolution', kind: 'uniform', text: 'uniform vec3 iChannelResolution[4];' },
		{ name: 'iChannel0', kind: 'define', text: '#define iChannel0 uSpectrum' },
		{ name: 'iChannel1', kind: 'texture', text: 'uniform sampler2D iChannel1;' },
		{ name: 'iChannel2', kind: 'texture', text: 'uniform sampler2D iChannel2;' },
		{ name: 'iChannel3', kind: 'texture', text: 'uniform sampler2D iChannel3;' },
		{ name: 'mainImage', kind: 'function', text: 'void mainImage( out vec4 fragColor, in vec2 fragCoord );' },
	],
};

export interface ShaderInputs {
	resolution: { name: string; type: 'vec2' | 'vec3' };
	time: string;
	frame: { name: string; type: 'float' | 'int' };
	mouse: { name: string; type: 'vec2' | 'vec4' };
	sound?: string;
	delta?: string;
}

const TWIGL_SHORT: ShaderInputs = {
	resolution: { name: 'r', type: 'vec2' },
	time: 't',
	frame: { name: 'f', type: 'float' },
	mouse: { name: 'm', type: 'vec2' },
	sound: 's',
};

/** The uniforms a host feeds per format: music time goes to `time`, the canvas size to `resolution`. */
export const shaderInputs: Record<WrappedShaderFormat, ShaderInputs> = {
	'twigl-classic': {
		resolution: { name: 'resolution', type: 'vec2' },
		time: 'time',
		frame: { name: 'frame', type: 'float' },
		mouse: { name: 'mouse', type: 'vec2' },
		sound: 'sound',
	},
	'twigl-geek': TWIGL_SHORT,
	'twigl-geeker': TWIGL_SHORT,
	'twigl-geekest': TWIGL_SHORT,
	'shadertoy': {
		resolution: { name: 'iResolution', type: 'vec3' },
		time: 'iTime',
		frame: { name: 'iFrame', type: 'int' },
		mouse: { name: 'iMouse', type: 'vec4' },
		delta: 'iTimeDelta',
	},
};

const MODE_OF_FORMAT: Record<WrappedShaderFormat, WrapperMode> = {
	'twigl-classic': 'classic',
	'twigl-geek': 'geek',
	'twigl-geeker': 'geeker',
	'twigl-geekest': 'geekest',
	'shadertoy': 'shadertoy',
};

const MUSIC_UNIFORMS = ['uBass', 'uMid', 'uTreble', 'uEnergy', 'uBeat', 'uBpm', 'uZoom', 'uGrade', 'uSpectrum'];

const MUSIC_DECLARATIONS = `uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform float uBpm;
uniform float uZoom;
uniform float uGrade;
uniform sampler2D uSpectrum;`;

/** Radians the hue turns on a full beat: a hint of color, so the shader keeps its own palette. */
export const GRADE_HUE_TURN = 0.3;
const GRADE_BASE = 0.92;
const GRADE_ENERGY = 0.2;
/** Above this a channel rolls off toward white instead of clipping, so loud music never flattens a scene to white. */
export const HIGHLIGHT_KNEE = 0.7;

export function gradeGain(energy: number): number {
	return GRADE_BASE + GRADE_ENERGY * energy;
}

export function softHighlight(value: number): number {
	if (value <= HIGHLIGHT_KNEE)
		return value;
	const over = value - HIGHLIGHT_KNEE;
	const room = 1 - HIGHLIGHT_KNEE;
	return HIGHLIGHT_KNEE + room * over / (over + room);
}

const glsl = (value: number): string => value.toFixed(3);

// Hue turn on the beat, exposure on the energy, mixed in by uGrade (0 = the shader's own color); alpha is always opaque.
const GRADE = `vec4 nmZoom(vec4 p, vec2 size) {
  vec2 c = 0.5 * size;
  p.xy = (p.xy - c) / max(uZoom, 0.001) + c;
  return p;
}
vec3 nmSoftHighlight(vec3 c) {
  vec3 over = max(c - ${glsl(HIGHLIGHT_KNEE)}, 0.0);
  float room = ${glsl(1 - HIGHLIGHT_KNEE)};
  return min(c, ${glsl(HIGHLIGHT_KNEE)}) + room * over / (over + room);
}
vec4 nmGrade(vec4 c) {
  float a = uBeat * ${glsl(GRADE_HUE_TURN)};
  vec3 u = vec3(0.57735027);
  vec3 graded = c.rgb * cos(a) + cross(u, c.rgb) * sin(a) + u * dot(u, c.rgb) * (1.0 - cos(a));
  graded = nmSoftHighlight(max(graded, 0.0) * (${glsl(GRADE_BASE)} + ${glsl(GRADE_ENERGY)} * uEnergy));
  c.rgb = mix(c.rgb, graded, uGrade);
  c.a = 1.0;
  return c;
}`;

export const FULLSCREEN_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HAS_MAIN = /\bvoid\s+main\s*\(/;

function declares(source: string, name: string): boolean {
	return new RegExp(`\\buniform\\s+(?:(?:highp|mediump|lowp)\\s+)?\\w+\\s+${name}\\b`).test(source);
}

function uniformNames(mode: WrapperMode): string[] {
	return wrapperItems[mode]
		.filter(item => item.kind === 'uniform' || item.kind === 'texture')
		.map(item => item.name);
}

interface WrapOptions {
	/** iChannel0 is a real sampler, not the spectrum macro (multi-pass files). */
	channelSamplers?: boolean;
	/** A buffer pass: its output is data, so no zoom and no grade. */
	data?: boolean;
}

export interface WrappedProgram { fragment: string; vertex: string; uniforms: string[] }

export interface WrappedPass extends WrappedProgram {
	name: Exclude<ShaderPassName, 'common'>;
	channels: ShaderPass['channels'];
}

const PASS_ORDER = ['bufferA', 'bufferB', 'bufferC', 'bufferD', 'image'] as const;

/** The program of a single-pass file, or the image pass of a multi-pass file. */
export function wrapShader(entry: ShaderEntry): WrappedProgram {
	const format = wrappedFormat(entry);
	return entry.passes ? wrapPasses(entry).at(-1)! : wrapSource(format, entry.source);
}

function wrappedFormat(entry: ShaderEntry): WrappedShaderFormat {
	if (entry.format === 'kodelife')
		throw new Error(`"${entry.id}" is a kodelife entry; its passes are complete programs and are not wrapped`);
	return entry.format;
}

/** One program per pass in render order: bufferA to bufferD, then the image. `common` goes in front of each. */
export function wrapPasses(entry: ShaderEntry): WrappedPass[] {
	const format = wrappedFormat(entry);
	const passes = entry.passes ?? [];
	const common = passes.find(pass => pass.name === 'common')?.source;
	return PASS_ORDER.flatMap((name) => {
		const pass = passes.find(candidate => candidate.name === name);
		if (!pass)
			return [];
		const source = common ? `${common}\n${pass.source}` : pass.source;
		return [{ name, channels: pass.channels, ...wrapSource(format, source, { channelSamplers: true, data: name !== 'image' }) }];
	});
}

/**
 * Builds a complete GLSL ES 3.00 program. User code keeps its own `main` (renamed to nmUserMain)
 * and `gl_FragCoord` (zoomed); our `main` runs it and grades the result.
 */
function wrapSource(format: WrappedShaderFormat, source: string, options: WrapOptions = {}): WrappedProgram {
	const mode = MODE_OF_FORMAT[format];
	const items = wrapperItems[mode];
	const inputs = shaderInputs[format];
	const size = inputs.resolution.type === 'vec3' ? `${inputs.resolution.name}.xy` : inputs.resolution.name;
	const toy = mode === 'shadertoy';
	const own = mode === 'geeker' || mode === 'geekest';
	const out = own ? 'o' : 'nmOut';

	const head: string[] = [];
	const tail: string[] = [];
	if (own) {
		const wrapper = items.filter(item => item.kind === 'wrapper');
		const bare = wrapper.length === 2 && !HAS_MAIN.test(source);
		head.push(...items.filter(item => item.kind !== 'wrapper').map(item => item.text));
		tail.push(bare ? `${wrapper[0]!.text}${source}${wrapper[1]!.text}` : source);
	}
	else {
		head.push('#version 300 es', 'precision highp float;', 'precision highp int;', 'precision highp sampler2D;');
		head.push(...items
			.filter(item => (item.kind === 'uniform' || item.kind === 'texture' || item.kind === 'define' || item.kind === 'function')
				&& !declares(source, item.name))
			.map(item => (options.channelSamplers && item.name === 'iChannel0' ? 'uniform sampler2D iChannel0;' : item.text)));
		tail.push(source);
	}

	const prelude = [
		MUSIC_DECLARATIONS,
		...own ? [] : ['out vec4 nmOut;'],
		'vec4 nmFragCoord;',
		'#define gl_FragCoord nmFragCoord',
		...toy ? [] : ['#define main nmUserMain'],
		...mode === 'classic' || mode === 'geek' ? ['#define gl_FragColor nmOut', '#define texture2D texture'] : [],
	];
	const run = toy ? `mainImage(nmOut, nmFragCoord.xy);` : 'nmUserMain();';
	const epilogue = [
		'#undef gl_FragCoord',
		...toy ? [] : ['#undef main'],
		GRADE,
		'void main() {',
		options.data ? '  nmFragCoord = gl_FragCoord;' : `  nmFragCoord = nmZoom(gl_FragCoord, ${size});`,
		`  ${run}`,
		...options.data ? [] : [`  ${out} = nmGrade(${out});`],
		'}',
	];

	return {
		fragment: [...head, ...prelude, ...tail, ...epilogue].join('\n'),
		vertex: FULLSCREEN_VERTEX,
		uniforms: [...uniformNames(mode), ...MUSIC_UNIFORMS, ...options.channelSamplers ? ['iChannel0'] : []],
	};
}
