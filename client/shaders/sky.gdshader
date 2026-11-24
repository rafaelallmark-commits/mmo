// Céu do amanhecer: degradê violeta → pêssego, sol, e nuvens de anime (ruído em camadas
// com borda nítida e lado iluminado), movendo-se devagar.
shader_type sky;

uniform vec3 top_color : source_color = vec3(0.33, 0.37, 0.66);
uniform vec3 horizon_color : source_color = vec3(0.96, 0.72, 0.56);
uniform vec3 ground_color : source_color = vec3(0.32, 0.27, 0.33);
uniform vec3 cloud_lit : source_color = vec3(1.0, 0.93, 0.86);
uniform vec3 cloud_shade : source_color = vec3(0.70, 0.62, 0.78);
uniform float cloud_cover = 0.5;
uniform vec3 sun_dir = vec3(0.45, 0.74, 0.5);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
	return v;
}

void sky() {
	vec3 d = EYEDIR;
	float up = d.y;
	vec3 col = mix(horizon_color, top_color, smoothstep(0.0, 0.55, up));
	col = mix(col, ground_color, smoothstep(0.0, -0.25, up));
	// sol e halo
	vec3 sd = LIGHT0_ENABLED ? LIGHT0_DIRECTION : normalize(sun_dir);
	float sdot = max(dot(d, sd), 0.0);
	col += vec3(1.0, 0.8, 0.55) * pow(sdot, 12.0) * 0.35 + vec3(1.0, 0.95, 0.85) * smoothstep(0.9985, 0.9995, sdot);
	// nuvens projetadas num "teto"
	if (up > 0.02) {
		vec2 uv = d.xz / (up + 0.12) * 1.4 + vec2(TIME * 0.006, TIME * 0.002);
		float n = fbm(uv);
		float c = smoothstep(1.0 - cloud_cover, 1.0 - cloud_cover + 0.08, n);
		float shade = smoothstep(0.0, 0.25, fbm(uv + sd.xz * 0.06) - n + 0.1);
		vec3 cc = mix(cloud_shade, cloud_lit, shade);
		col = mix(col, cc, c * smoothstep(0.02, 0.2, up) * 0.95);
	}
	COLOR = col;
}
