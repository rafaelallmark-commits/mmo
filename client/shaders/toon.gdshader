// Sombreamento em faixas (cel shading) com sombra colorida e luz de borda.
shader_type spatial;

uniform vec4 albedo : source_color = vec4(1.0);
uniform vec4 shade_tint : source_color = vec4(0.58, 0.52, 0.72, 1.0);
uniform float threshold = 0.48;
uniform float softness = 0.03;
uniform vec4 rim_color : source_color = vec4(1.0, 0.94, 0.82, 1.0);
uniform float rim_strength = 0.45;
uniform vec4 emission : source_color = vec4(0.0, 0.0, 0.0, 1.0);

void fragment() {
	ALBEDO = albedo.rgb;
	EMISSION = emission.rgb;
}

void light() {
	float ndl = dot(NORMAL, LIGHT) * 0.5 + 0.5;
	float lit = smoothstep(threshold - softness, threshold + softness, ndl);
	lit *= step(0.35, ATTENUATION);
	vec3 band = mix(shade_tint.rgb, vec3(1.0), lit);
	DIFFUSE_LIGHT += ALBEDO * band * LIGHT_COLOR / PI;
	float rim = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	rim = smoothstep(0.62, 0.68, rim) * lit;
	DIFFUSE_LIGHT += rim * rim_color.rgb * rim_strength * LIGHT_COLOR / PI;
}
