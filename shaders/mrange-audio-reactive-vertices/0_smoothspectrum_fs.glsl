// CC0: Audio reactive vertices
//   An example of using KodeLife's audio spectrum with vertex and fragment shaders

// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, mrange has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#version 300 es

precision highp float;

uniform sampler2D input_spectrum;
uniform sampler2D history;

out vec4 FC;

void main() { 
  ivec2
    xy=ivec2(gl_FragCoord.xy)
  ;
  float
    fft=sqrt(texelFetch(input_spectrum,xy,0)).x
  ;
  vec4
    h=texelFetch(history,xy,0)
  ;
  FC = vec4(
    fft
  , max(.93*h.y,fft)
  , mix(h.z,fft,.3)
  , max(mix(fft,h.w,.93),fft)
  );
}
