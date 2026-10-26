#version 300 es

precision highp float;

uniform vec2      resolution;
uniform sampler2D lines;
uniform sampler2D blur_y;

out vec4 FC;

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

void main() {
  vec4
    p=texelFetch(lines,ivec2(gl_FragCoord.xy),0)
  , P=texelFetch(blur_y,ivec2(gl_FragCoord.xy),0)
  ;
  vec3
    col=p.xyz+P.xyz
  ;
  
  col*=2.;
  col=tanh_approx(col);
  col=max(col,0.);
  col=sqrt(col)-.01*vec3(2,3,1);
  col=max(col,0.);
  
  FC=vec4(col,1.);
}
