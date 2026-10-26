#version 300 es

precision highp float;

uniform float time;
uniform mat4 mvp;
uniform sampler2D smooth_spectrum;

in vec4 a_position;

out float v_spiral_length;

const float 
  B=.4
, PI=acos(-1.)
, TAU=2.*PI
;

float spiralLength(float b, float a) {
  // https://en.wikipedia.org/wiki/Archimedean_spiral
  return 0.5*b*(a*sqrt(1.0+a*a)+log(a+sqrt(1.0+a*a)));
}

// License: Unknown, author: Unknown, found: don't remember
float hash(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

vec4 lintex(float x) {
  float
    i=clamp(x*255.,0.,254.)
  , f=fract(i)
  ;

  int 
    n0=int(i)
  , n1=n0+1
  ;
  
  ivec2
    itx0=ivec2(n0&0xF,n0>>4)
  , itx1=ivec2(n1&0xF,n1>>4)
  ;

  vec4
    c0 = texelFetch(smooth_spectrum, itx0, 0)
  , c1 = texelFetch(smooth_spectrum, itx1, 0)
  ;

  return mix(c0,c1,f);
}

float spectrum(float x) {
  x*=.125;

  float
    n=floor(x)
  , c=fract(x)
  , s=mod(n,2.)
  ;
  return lintex(.01+.85*mix(c,1.-c,s)).w;
}

void main() {
  int 
    iid=gl_InstanceID
  , vid=gl_VertexID
  , nid=iid>>9
  , cid=iid&0x1FF
  , i=(cid*6+vid+1)>>1
  , bin=i
  ;

  float
    id=float(i)
  , NID=float(nid)
  , a=sqrt(id)
  , h0=hash(NID+.123)
  , h1=hash(NID+.245)
  , o=TAU*(h0*h0*h0*h0)-.3*time
  , r=B*a
  , A=spiralLength(B,a)
  , s=spectrum(A+h1)
  , y=(3.+2.*r)*s
  , R=sqrt(y)*2.
  , x=(r+R)*sin(a+o)
  , z=(r+R)*cos(a+o)
  ;


  vec3
    p=vec3(x,y,z)
  ;

  gl_Position = mvp*vec4(p,1);
  v_spiral_length=A;
}
