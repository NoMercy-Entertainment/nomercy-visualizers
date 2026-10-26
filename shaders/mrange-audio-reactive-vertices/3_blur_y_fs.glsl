#version 300 es

precision highp float;

uniform float time;
uniform sampler2D blur_x;
uniform sampler2D blur_y;

out vec4 FC;

vec3 gb(sampler2D pp, ivec2 dir, ivec2 xy) {
  const float
    blurriness      =128.
  ;

  ivec2
    off
  ;
  vec3
    col=texelFetch(pp,xy,0).xyz
  ;

  float
    w
  , ws=1.
  , I
  ;

  for(int i=1;i<19;++i) {
    I=float(i);
    w=exp(-(I*I)/blurriness);
    off=dir*i;

    col+=w*(texelFetch(pp,xy-off,0).xyz+texelFetch(pp,xy+off,0).xyz);
    ws+=2.*w;
  }
  col/=ws;
  return col;
}

void main(void) {
  vec3
    p=gb(blur_x, ivec2(0,1), ivec2(gl_FragCoord.xy))
  , P=texelFetch(blur_y,ivec2(gl_FragCoord.xy+20.*normalize(sin(.3*time*vec2(1, sqrt(.5))))),0).xyz
  ;
  FC=vec4(mix(p,P,.5),1);
}


