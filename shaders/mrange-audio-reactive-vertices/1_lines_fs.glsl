#version 300 es

precision highp float;

uniform float time;

out vec4 FC;

in float v_spiral_length;


void main() {
  vec3
    col=vec3(0)
  ;
  vec4
    l=1.1+sin(vec4(6,1,8,0)+v_spiral_length*sqrt(.5)-time)
  ;
  col+=l.w*l.xyz*exp(-.02*v_spiral_length);
  FC=vec4(col,1);
}
