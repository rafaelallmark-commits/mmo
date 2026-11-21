// Bandeira tremulando (vértices ondulam a partir do mastro, UV.x = 0 no mastro).
shader_type spatial;
render_mode cull_disabled, diffuse_toon, specular_disabled;

uniform vec4 albedo : source_color = vec4(0.8, 0.3, 0.2, 1.0);
uniform vec4 emblem : source_color = vec4(0.95, 0.75, 0.3, 1.0);

void vertex() {
	float k = UV.x;
	VERTEX.z += sin(TIME * 4.0 - UV.x * 6.0) * 0.12 * k;
	VERTEX.y += sin(TIME * 3.0 - UV.x * 4.0) * 0.04 * k;
}

void fragment() {
	vec2 d = UV - vec2(0.5, 0.5);
	float circle = step(length(d * vec2(1.6, 1.0)), 0.22);
	vec3 c = mix(albedo.rgb, emblem.rgb, circle);
	ALBEDO = c * 0.45;
	EMISSION = c * vec3(0.13, 0.12, 0.22);
	ROUGHNESS = 0.4;
}
