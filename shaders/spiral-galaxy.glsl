// format: shadertoy
// name: Spiral Galaxy
// author: NoMercy Entertainment
// license: Apache-2.0

// A spiral galaxy seen at a tilt, in the colors of the Hubble pictures: an old golden core, young blue arms
// with pink hydrogen knots where stars are born, and dark dust lanes along the inner edge of each arm.
// Music: bass brightens the core, mids turn the arms, a beat lights the star-forming knots, treble twinkles
// the foreground stars of our own galaxy.

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

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		v += a * noise(p);
		p = p * 2.07 + vec2(1.3, 7.7);
		a *= 0.5;
	}
	return v;
}

mat2 rot(float a) {
	float c = cos(a), s = sin(a);
	return mat2(c, -s, s, c);
}

vec3 foreground(vec2 uv, float twinkle) {
	vec3 col = vec3(0.0);
	for (int l = 0; l < 2; l++) {
		float scale = l == 0 ? 11.0 : 24.0;
		vec2 g = uv * scale + float(l) * 13.7;
		vec2 id = floor(g);
		vec2 f = fract(g) - 0.5;
		float h = hash21(id);
		if (h > 0.8) {
			vec2 o = vec2(hash21(id + 7.1), hash21(id + 3.3)) - 0.5;
			vec2 d = f - o * 0.6;
			float bright = pow((h - 0.8) / 0.2, 6.0);
			float tw = 1.0 + twinkle * sin(iTime * (3.0 + 8.0 * hash21(id + 1.9)) + h * 30.0);
			vec3 tint = mix(vec3(1.0, 0.75, 0.55), vec3(0.7, 0.85, 1.0), hash21(id + 11.0));
			float core = 0.0003 / (dot(d, d) + 0.0002);
			float spikes = 0.0;
			for (int k = 0; k < 2; k++) {
				vec2 r = rot(float(k) * 1.5708) * d;
				spikes += 0.0008 / (abs(r.y) * 60.0 + 0.006) * smoothstep(0.5, 0.0, abs(r.x));
			}
			col += tint * (core * (0.2 + 1.8 * bright) + spikes * bright * 2.0) * tw * (l == 0 ? 1.0 : 0.5);
		}
	}
	return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
	float t = iTime;

	// The disk is tilted toward us: undo the tilt and the roll to get coordinates in the galaxy's own plane.
	vec2 p = rot(0.45) * uv;
	p.y /= 0.42;
	p *= 2.0;
	float r = length(p);
	float a = atan(p.y, p.x);

	// Two logarithmic arms; the angle winds with the log of the radius. Mids speed the turn.
	float turn = t * (0.03 + 0.05 * uMid);
	float wind = 3.2;
	vec2 q = rot(-turn) * p;
	// Noise bends the phase, so the arms branch into spurs and break up instead of running as clean bands.
	float armPhase = 2.0 * (a - turn) - wind * log(r + 0.05) * 2.0 + 1.8 * (fbm(q * 2.2) - 0.5);
	float arm = pow(0.5 + 0.5 * cos(armPhase), 2.5);
	// Clumps along the arms and a fine grain of star clusters across the whole disk.
	float clump = fbm(q * 3.0 + 4.0);
	float grain = 0.55 + 0.9 * noise(q * 55.0) * noise(q * 23.0 + 3.0);
	float disk = exp(-r * 1.1);
	float arms = arm * disk * (0.4 + 1.0 * clump) * grain;

	// Dust lanes sit just inside each arm: the same spiral, shifted a little in phase, broken up by noise.
	float lane = pow(0.5 + 0.5 * cos(armPhase + 0.85), 8.0) * smoothstep(0.12, 0.45, r) * exp(-r * 0.5);
	float dust = clamp(lane * (0.5 + 1.1 * fbm(q * 7.0)), 0.0, 0.95);

	// Pink hydrogen knots where stars are born, along the brightest parts of the arms.
	float knotField = fbm(q * 24.0 + 2.0);
	float knots = smoothstep(0.7, 0.82, knotField) * pow(arm, 2.0) * pow(disk, 1.6) * (0.8 + 1.8 * uBeat);

	// The bulge: old stars, warm.
	float bulge = exp(-r * r * 9.0) * (1.1 + 0.9 * uBass) + exp(-r * 3.5) * 0.25;

	vec3 col = vec3(0.0);
	col += vec3(1.0, 0.82, 0.55) * bulge;
	col += vec3(0.45, 0.65, 1.0) * arms * 1.3;
	col += vec3(0.75, 0.75, 0.8) * disk * 0.12;
	col += vec3(1.0, 0.3, 0.55) * knots * 2.6;
	col *= 1.0 - dust;

	// A faint halo so the edge of the disk fades into space, not into a cut.
	col += vec3(0.04, 0.05, 0.08) * exp(-r * 0.7);

	col += foreground(uv + vec2(t * 0.002, 0.0), 0.15 + 0.8 * uTreble);

	col = 1.0 - exp(-col * (1.4 + 0.4 * uEnergy));
	col = pow(col, vec3(1.1));
	fragColor = vec4(col, 1.0);
}
