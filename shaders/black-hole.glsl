// format: shadertoy
// name: Black Hole
// author: NoMercy Entertainment
// license: Apache-2.0

// A non-spinning (Schwarzschild) black hole with a thin accretion disk, in units where the event horizon is at r = 1
// (M = 0.5). Physics used:
// - Light paths: each ray is traced back from the camera with the Schwarzschild photon equation written as
//   a = -1.5 h^2 r / |r|^5, which bends light exactly like the real metric (h = the ray's angular momentum).
// - The disk starts at the innermost stable circular orbit, r = 6M = 3, and follows the thin-disk temperature
//   profile T ~ (r^-3 (1 - sqrt(r_in / r)))^(1/4).
// - Each point of the disk is seen with the shift factor of gas on a circular orbit, gravity and motion together:
//   g = sqrt(1 - 3M/r) / (1 - Omega * L), Omega = sqrt(M / r^3), L = the photon's angular momentum per energy.
//   Brightness scales with g^4 and the shifted temperature g T.
// - Color: the observed brightness on the "afmhot" scale (black, red, orange, yellow, white), the false-color
//   map the Event Horizon Telescope uses for its black hole pictures. True blackbody light at these
//   temperatures would look a pale warm white.
// Music: bass raises the accretion rate (a hotter, brighter disk), mids turn the gas pattern, a beat lights a hot
// spot that orbits at the inner edge (the flares seen at Sagittarius A*), treble twinkles the stars.

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
		p = p * 2.1 + vec2(1.3, 7.7);
		a *= 0.5;
	}
	return v;
}

// Stars on a sphere of directions, so lensing moves them the way it moves real stars.
vec3 sky(vec3 d, float twinkle) {
	vec2 sp = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
	vec3 col = vec3(0.0);
	for (int l = 0; l < 2; l++) {
		// Cells big enough that a star is a few pixels wide; smaller ones alias into dashes.
		float scale = l == 0 ? 28.0 : 55.0;
		vec2 g = sp * scale;
		vec2 id = floor(g);
		vec2 f = fract(g) - 0.5;
		float h = hash21(id + float(l) * 17.0);
		if (h > 0.86) {
			vec2 o = vec2(hash21(id + 7.1), hash21(id + 3.3)) - 0.5;
			float r = length(f - o * 0.6);
			float tw = 1.0 + twinkle * sin(iTime * (2.0 + 8.0 * hash21(id + 1.9)) + h * 30.0);
			vec3 tint = mix(vec3(1.0, 0.75, 0.55), vec3(0.7, 0.85, 1.0), hash21(id + 11.0));
			col += tint * (0.002 / (r * r + 0.002)) * pow((h - 0.86) / 0.14, 3.0) * tw * (l == 0 ? 1.0 : 0.5);
		}
	}
	float band = exp(-abs(d.y + 0.25 * sin(sp.x * 2.0)) * 6.0);
	col += vec3(0.06, 0.05, 0.08) * band * (0.5 + fbm(sp * 6.0));
	return col;
}

// The afmhot color map (matplotlib), as the Event Horizon Telescope uses it: brightness 0 to 1 runs through
// black, red, orange and yellow to white.
vec3 afmhot(float x) {
	x = clamp(x, 0.0, 1.0);
	return clamp(vec3(2.0 * x, 2.0 * x - 0.5, 2.0 * x - 1.0), 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
	float t = iTime;
	const float M = 0.5;
	const float R_IN = 3.0;
	const float R_OUT = 12.0;

	// The camera sits a little above the disk plane and drifts slowly around the hole.
	float orbit = t * 0.02;
	vec3 ro = vec3(sin(orbit) * 18.0, 2.0 + 0.5 * sin(t * 0.05), -cos(orbit) * 18.0);
	vec3 fw = normalize(-ro);
	vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
	vec3 up = cross(fw, rt);
	vec3 rd = normalize(fw * 1.7 + rt * uv.x + up * uv.y);

	vec3 pos = ro;
	vec3 vel = rd;
	vec3 hv = cross(pos, vel);
	float h2 = dot(hv, hv);
	// The ray runs backward from the camera, so the light's own angular momentum about the disk axis is -hv.y.
	float lightL = -hv.y;

	// Accretion rate sets the temperature (T ~ Mdot^(1/4)), so the brightness grows with it (~ Mdot). The color map
	// reads brightness relative to T_BASE, so only ratios matter, as in the telescope pictures.
	const float T_BASE = 4500.0;
	float tScale = T_BASE * pow(0.6 + 1.2 * uBass, 0.25);
	// The thin-disk profile peaks at r = 49/36 r_in; divide by that peak so tScale is the hottest temperature.
	float rPeak = R_IN * 49.0 / 36.0;
	float profilePeak = pow(pow(rPeak, -3.0) * (1.0 - sqrt(R_IN / rPeak)), 0.25);

	// The disk's observed brightness, summed over every crossing (the direct image and the lensed ones).
	float seen = 0.0;
	float alpha = 1.0;
	bool captured = false;
	float swirl = t * (0.15 + 0.25 * uMid);
	// The gas orbits with positive angular momentum about +y, which is a falling angle atan(z, x); the shift
	// factor below assumes the same sense, so the bright side is the side that moves toward the camera.
	// The hot spot rides the inner orbit at the gas's own orbital speed.
	const float R_SPOT = R_IN + 0.4;
	float spotAngle = -t * sqrt(M / (R_SPOT * R_SPOT * R_SPOT));

	for (int i = 0; i < 220; i++) {
		float r2 = dot(pos, pos);
		float r = sqrt(r2);
		if (r < 1.0) {
			captured = true;
			break;
		}
		if (r > 50.0)
			break;
		// Small steps near the hole, where the light bends most.
		float dt = 0.06 * clamp((r - 0.9) * 0.6, 0.2, 4.0);
		vec3 prev = pos;
		vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
		pos += vel * dt;

		if (prev.y * pos.y < 0.0) {
			vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
			float rr = length(hit.xz);
			if (rr > R_IN && rr < R_OUT) {
				float ang = atan(hit.z, hit.x);
				// Shear: inner gas orbits faster (Omega ~ r^-1.5), which draws the turbulence out into arcs.
				float sw = ang + swirl * pow(R_IN / rr, 1.5);
				float gas = 0.55 + 0.45 * (fbm(vec2(sw * 4.0, rr * 1.8)) * 0.7 + 0.3 * fbm(vec2(sw * 12.0, rr * 6.0)));

				float profile = pow(pow(rr, -3.0) * (1.0 - sqrt(R_IN / rr)), 0.25) / profilePeak;
				float tEmit = tScale * profile;

				float omega = sqrt(M / (rr * rr * rr));
				float g = sqrt(1.0 - 3.0 * M / rr) / (1.0 - omega * lightL);
				float tSeen = g * tEmit;

				// Bolometric brightness: emitted sigma T^4, times g^4, relative to the base disk.
				float bright = pow(tSeen / T_BASE, 4.0);

				// The hot spot: a Gaussian blob on the inner orbit, lit by the beat.
				vec2 spot = vec2(cos(spotAngle), sin(spotAngle)) * R_SPOT;
				float spotGlow = uBeat * 3.0 * exp(-dot(hit.xz - spot, hit.xz - spot) * 1.2);

				float edge = smoothstep(R_IN, R_IN + 0.25, rr) * smoothstep(R_OUT, R_OUT - 4.0, rr);
				seen += alpha * (bright * gas + spotGlow * pow(g, 4.0)) * edge;
				alpha *= 1.0 - clamp(edge * gas * 0.85, 0.0, 1.0);
				if (alpha < 0.02)
					break;
			}
		}
	}

	// Exposure: a soft roll-off keeps the hottest gas from clipping, then the brightness takes its map color.
	vec3 col = afmhot(1.0 - exp(-seen * (1.3 + 0.4 * uEnergy)));
	if (!captured)
		col += alpha * sky(normalize(vel), 0.2 + 0.8 * uTreble);
	fragColor = vec4(min(col, 1.0), 1.0);
}
