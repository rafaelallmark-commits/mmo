// Chão em faixas com manchas de cor (ruído pela posição no mundo).
shader_type spatial;

uniform vec4 color_a : source_color = vec4(0.42, 0.40, 0.28, 1.0);
uniform vec4 color_b : source_color = vec4(0.36, 0.42, 0.26, 1.0);
uniform vec4 shade_tint : source_color = vec4(0.55, 0.52, 0.70, 1.0);
uniform float scale = 0.06;

varying vec3 world_pos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float n = noise(world_pos.xz * scale) * 0.65 + noise(world_pos.xz * scale * 4.0) * 0.35;
	float stepped = floor(n * 3.0) / 3.0;
	ALBEDO = mix(color_a.rgb, color_b.rgb, stepped);
}

void light() {
	float ndl = dot(NORMAL, LIGHT) * 0.5 + 0.5;
	float lit = smoothstep(0.45, 0.5, ndl) * step(0.35, ATTENUATION);
	DIFFUSE_LIGHT += ALBEDO * mix(shade_tint.rgb, vec3(1.0), lit) * LIGHT_COLOR / PI;
}
