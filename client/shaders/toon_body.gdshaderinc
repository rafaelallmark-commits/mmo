// Sombreamento em faixas (cel shading) com sombra colorida e luz de borda. Corpo de toon.gdshader e de
// toon_fx.gdshader (este com os efeitos do corpo de um personagem, FX_BODY: fx_body.gdshaderinc).

uniform vec4 albedo : source_color = vec4(1.0);
uniform vec4 shade_tint : source_color = vec4(0.50, 0.44, 0.64, 1.0);
uniform float lit_level = 0.78;
uniform float threshold = 0.48;
uniform float softness = 0.03;
uniform vec4 rim_color : source_color = vec4(1.0, 0.94, 0.82, 1.0);
uniform float rim_strength = 0.45;
uniform vec4 emission : source_color = vec4(0.0, 0.0, 0.0, 1.0);

#ifdef FX_BODY
#include "res://shaders/fx_body.gdshaderinc"
#endif

void fragment() {
#ifdef FX_BODY
	float fx_glow = fx_cut((INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
	if (fx_glow < 0.0) {
		discard;
	}
	ALBEDO = fx_color(albedo.rgb) * (1.0 - fx_glow);
	EMISSION = emission.rgb + fx_edge.rgb * fx_glow * 1.6;
#else
	ALBEDO = albedo.rgb;
	EMISSION = emission.rgb;
#endif
}

void light() {
	float ndl = dot(NORMAL, LIGHT) * 0.5 + 0.5;
	float lit = smoothstep(threshold - softness, threshold + softness, ndl);
	lit *= step(0.35, ATTENUATION);
	vec3 band = mix(shade_tint.rgb * lit_level, vec3(lit_level), lit);
	DIFFUSE_LIGHT += ALBEDO * band * LIGHT_COLOR / PI;
	float rim = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	rim = smoothstep(0.62, 0.68, rim) * lit;
	DIFFUSE_LIGHT += rim * rim_color.rgb * rim_strength * LIGHT_COLOR / PI;
}
