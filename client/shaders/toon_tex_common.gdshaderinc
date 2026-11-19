// Cel shading com textura (modelos VRM), com iluminação calculada aqui mesmo (o material é
// "unshaded"): direção e cor do sol vêm de parâmetros globais (project.godot → shader_globals,
// atualizados pelo jogo). Assim o resultado não muda com sombras/passadas do renderizador.
// Calibrado com --lightprobe: área iluminada ≈ cor pintada na textura após o tonemapping.
global uniform vec3 sun_direction;
global uniform vec4 sun_color;
global uniform vec4 ambient_tint;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 albedo : source_color = vec4(1.0);
uniform bool recolor_on = false;
uniform vec4 recolor : source_color = vec4(1.0);
uniform float ref_lum = 0.5;
uniform float recolor_mix = 1.0;
uniform float alpha_cut = 0.0;
uniform vec4 shade_tint : source_color = vec4(0.74, 0.68, 0.84, 1.0);
uniform float lit_level = 0.72;
uniform float threshold = 0.40;
uniform float softness = 0.05;
uniform vec4 rim_color : source_color = vec4(1.0, 0.95, 0.86, 1.0);
uniform float rim_strength = 0.22;
uniform vec4 emission_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);

void fragment() {
	vec4 t = texture(albedo_tex, UV) * albedo;
	vec3 c = t.rgb;
	if (recolor_on) {
		float lum = dot(c, vec3(0.299, 0.587, 0.114));
		vec3 rc = recolor.rgb * clamp(lum / max(ref_lum, 0.01), 0.0, 1.8);
		c = mix(c, rc, recolor_mix);
	}
	vec3 L = normalize((VIEW_MATRIX * vec4(sun_direction, 0.0)).xyz);
	vec3 N = normalize(NORMAL);
	if (!FRONT_FACING) {
		N = -N;
	}
	float ndl = dot(N, L) * 0.5 + 0.5;
	float lit = smoothstep(threshold - softness, threshold + softness, ndl);
	vec3 band = mix(shade_tint.rgb, vec3(1.0), lit) * lit_level;
	vec3 light = band * sun_color.rgb + ambient_tint.rgb;
	float rim = 1.0 - clamp(dot(N, VIEW), 0.0, 1.0);
	rim = smoothstep(0.66, 0.72, rim) * lit;
	ALBEDO = c * light + rim * rim_color.rgb * rim_strength * sun_color.rgb + emission_color.rgb;
	ALPHA = t.a;
	ALPHA_SCISSOR_THRESHOLD = alpha_cut;
}
