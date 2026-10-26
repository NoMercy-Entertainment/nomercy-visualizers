// format: twigl-geekest
// name: 4D Fractal Burst
// author: NoMercy Entertainment
// license: CC0 1.0 (based on mrange's 4D Fractal, permission 2026-10-25, https://twigl.app/?ol=true&ss=-P4mN9lXTv2ifEwoZ1px)

// The burst is the one uBeat term before o=p: it cuts space into cells and pushes each cell out from the center, so the clusters split apart on the beat and the inner fold stays mrange's own. At uBeat 0 this is mrange's shader unchanged.
float d,e,i,s,z;vec4 p,O;for(mat2 R=rotate2D(t/27.);p=vec4(z*normalize(vec3(FC.xy-.5*r,r.y)),.6),--p.z,p.xw*=R,p.wy*=R,p.zw*=R,p-=(floor(p*1.5)+.5)/1.5*uBeat*.4,o=p,++i<77.;p=abs(p/s),d=min(length(p.xy)+3e-4,min(p.z,p.w)+3e-3),p=e*e+3.+3.*cos(13.*dot(o.xy,o.zw)+vec4(2,7,0,4)),O+=p.w/d/(1.+7.*e*e*e)*exp(-z*z*.5)*p,z+=.6*d+1e-3)for(s=d=1.;++d<7.;s*=e)p-=2.*round(p*.5),p*=e=2./dot(p,p);o=tanh(O/2e4-length(FC.xy/r-.5)/5.*vec4(2,3,1,0))/.9;
