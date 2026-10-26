// format: shadertoy
// name: Pulse Rings
// author: NoMercy Entertainment
// license: Apache-2.0

vec3 palette(float k) {
	return 0.5 + 0.5 * cos(6.28318 * (k + vec3(0.0, 0.33, 0.67)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
	float r = length(uv);
	float side = abs(atan(uv.y, uv.x)) / 3.14159265;

	// Row 0 of the spectrum texture is the frequency data, row 1 the waveform.
	float fft = texture(iChannel0, vec2(side, 0.25)).x;
	float wave = texture(iChannel0, vec2(side, 0.75)).x - 0.5;

	float ring = 0.22 + 0.12 * uBass + 0.18 * fft;
	float d = abs(r - ring - 0.03 * wave);
	vec3 col = palette(iTime * 0.05 + r * 0.8 + fft * 0.4) * (0.004 + 0.01 * uTreble) / (d + 0.002);

	for (int i = 1; i < 5; i++) {
		float k = float(i);
		float e = abs(r - ring * (1.0 + k * 0.55) - 0.02 * sin(iTime * 0.7 + k * 1.7));
		col += palette(iTime * 0.05 + k * 0.17) * 0.0025 / (e + 0.004) / k;
	}

	col += vec3(0.02, 0.03, 0.06) / (r + 0.3);
	fragColor = vec4(1.0 - exp(-col), 1.0);
}
