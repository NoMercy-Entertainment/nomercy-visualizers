// CC0: Audio reactive vertices
//   An example of using KodeLife's audio spectrum with vertex and fragment shaders

// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, mrange has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#version 300 es

// Minimal vertex shader; transforms vertices using the current (orthographic) projection

uniform mat4 mvp;

in vec4 a_position;
void main() {
  gl_Position = mvp * a_position;
}
