// format: shadertoy
// name: Nebula
// author: NoMercy Entertainment
// license: Apache-2.0

// An emission nebula in the style of the JWST pictures: glowing hydrogen and oxygen gas in sharp filaments,
// dark dust pillars lit at their rims by a hot young cluster, and a star field whose bright stars carry the
// six-point diffraction spikes. Layers drift at different speeds, so the picture has depth.
// Music: bass lights the gas, mids stir it, treble makes the stars twinkle, a beat flares the cluster.

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

mat2 rot(float a) {
	float c = cos(a), s = sin(a);
	return mat2(c, -s, s, c);
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	mat2 m = rot(0.5) * 2.02;
	for (int i = 0; i < 6; i++) {
		v += a * noise(p);
		p = m * p + vec2(1.7, 9.2);
		a *= 0.5;
	}
	return v;
}

// Ridged noise: sharp crests, the look of gas filaments.
float ridged(vec2 p) {
	float v = 0.0;
	float a = 0.6;
	mat2 m = rot(-0.4) * 2.07;
	for (int i = 0; i < 6; i++) {
		float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
		v += a * n * n;
		p = m * p + vec2(3.1, 4.7);
		a *= 0.5;
	}
	return v;
}

// Domain warp: the coordinates bend by the noise itself, so the gas curls like real turbulence.
vec2 warp(vec2 p, float t) {
	vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
	return p + 1.6 * q;
}

vec3 stars(vec2 uv, float scale, float twinkle) {
	vec2 g = uv * scale;
	vec2 id = floor(g);
	vec2 f = fract(g) - 0.5;
	float h = hash21(id);
	if (h < 0.78)
		return vec3(0.0);
	vec2 o = vec2(hash21(id + 7.1), hash21(id + 3.3)) - 0.5;
	vec2 d = f - o * 0.6;
	float bright = pow((h - 0.78) / 0.22, 8.0);
	float tw = 1.0 + twinkle * sin(iTime * (3.0 + 9.0 * hash21(id + 1.9)) + h * 40.0);
	float core = 0.00035 / (dot(d, d) + 0.0002);
	float spikes = 0.0;
	for (int k = 0; k < 3; k++) {
		vec2 r = rot(float(k) * 1.0472 + 0.26) * d;
		spikes += 0.001 / (abs(r.y) * 70.0 + 0.006) * smoothstep(0.5, 0.0, abs(r.x));
	}
	vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.7, 0.85, 1.0), hash21(id + 11.0));
	return tint * (core * (0.2 + 2.0 * bright) + spikes * bright * 2.5) * tw;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
	float t = iTime * 0.02;
	vec2 drift = vec2(t, t * 0.3);

	// The hot cluster that lights everything, a little off center.
	vec2 sun = vec2(0.35, 0.18) + 0.03 * vec2(sin(t * 3.0), cos(t * 2.0));
	vec2 toSun = sun - uv;
	float sunDist = length(toSun);

	// Back layer: the glowing gas, slow.
	vec2 pg = uv * 1.6 + drift * 0.6;
	vec2 wg = warp(pg, t * (1.0 + 2.0 * uMid));
	float shape = fbm(wg * 0.7);
	float fil = ridged(wg * 1.3);
	float gas = smoothstep(0.2, 0.62, shape) * (0.3 + 1.1 * pow(fil, 1.8));
	vec3 ha = vec3(1.0, 0.22, 0.1);
	vec3 o3 = vec3(0.08, 0.7, 0.95);
	// Oxygen glows in the thin outer gas, hydrogen in the thick inner gas, as in the real pictures.
	vec3 emit = mix(o3, ha, smoothstep(0.38, 0.55, shape + 0.1 * fil));
	// Gas near the cluster is ionized hotter and brighter.
	float near = exp(-sunDist * 2.2);
	emit = mix(emit, vec3(1.0, 0.85, 0.65), near * 0.5);
	float glow = 0.75 + 0.55 * uBass + 0.35 * uBeat;
	vec3 col = emit * gas * glow * (0.9 + 1.8 * near);

	// Far stars sit behind the gas.
	vec3 sky = stars(uv + drift * 0.2, 9.0, 0.1 + 0.5 * uTreble);
	sky += stars(uv * 1.3 + drift * 0.35 + 3.1, 20.0, 0.2 + 0.7 * uTreble) * 0.6;
	sky += stars(uv * 1.7 + drift * 0.5 + 7.7, 42.0, 0.3 + 0.9 * uTreble) * 0.35;
	col += sky * (1.0 - 0.7 * gas);

	// Front layer: dust pillars, faster for parallax, dark, lit at the rim that faces the cluster.
	vec2 pd = uv * 1.2 + drift * 1.4 + vec2(0.0, 2.0);
	vec2 wd = warp(pd * vec2(1.0, 0.6), t * 0.5);
	float dustField = fbm(wd) + 0.35 * (uv.y + 0.3) * -1.0;
	float dust = smoothstep(0.48, 0.58, dustField);
	// The rim: where the dust edge faces the cluster, from the field's slope toward the light.
	float e = 0.004;
	float dx = fbm(warp((uv + vec2(e, 0.0)) * 1.2 + drift * 1.4 + vec2(0.0, 2.0), t * 0.5) * vec2(1.0, 0.6)) - fbm(wd);
	float dy = fbm(warp((uv + vec2(0.0, e)) * 1.2 + drift * 1.4 + vec2(0.0, 2.0), t * 0.5) * vec2(1.0, 0.6)) - fbm(wd);
	vec2 slope = vec2(dx, dy) / e;
	float facing = clamp(dot(normalize(-slope + 1e-5), normalize(toSun)), 0.0, 1.0);
	// A thin bright rim, not a lit body: only the outer few percent of the edge, sharpened by the facing.
	float edge = smoothstep(0.46, 0.5, dustField) - smoothstep(0.5, 0.53, dustField);
	vec3 rim = vec3(1.0, 0.45, 0.2) * edge * pow(facing, 2.0) * (0.4 + 1.6 * near) * glow;
	vec3 dustColor = vec3(0.03, 0.015, 0.01) + vec3(0.1, 0.04, 0.02) * fil * near;
	col = mix(col, dustColor, dust * 0.92) + rim * 0.7;

	// The cluster itself: a bright core and its spikes, flaring on the beat.
	float flare = 0.6 + 0.8 * uBeat + 0.3 * uBass;
	col += vec3(1.0, 0.92, 0.8) * 0.0015 / (sunDist * sunDist + 0.0015) * flare;
	for (int k = 0; k < 3; k++) {
		vec2 r = rot(float(k) * 1.0472 + 0.26) * (uv - sun);
		col += vec3(0.9, 0.85, 1.0) * 0.0008 / (abs(r.y) + 0.0015) * smoothstep(0.6, 0.0, abs(r.x)) * flare * 0.25;
	}

	col = 1.0 - exp(-col * (1.3 + 0.4 * uEnergy));
	col = pow(col, vec3(1.1));
	fragColor = vec4(col, 1.0);
}
