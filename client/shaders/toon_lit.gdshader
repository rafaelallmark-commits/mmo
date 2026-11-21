// Peças sólidas do cenário (troncos, pedras, casas, ruínas): cel shading do próprio motor
// (diffuse_toon, recebe sombras), leve variação de tom por instância e "vazado" quando ficam
// entre a câmera e o personagem.
shader_type spatial;
render_mode diffuse_toon, specular_disabled;

#include "res://shaders/fade.gdshaderinc"

uniform vec4 albedo : source_color = vec4(0.6, 0.5, 0.4, 1.0);
uniform vec4 emission : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float var_amount = 0.08;
uniform bool fade_enabled = true;
uniform bool use_instance_color = false;
// ver terrain.gdshader: albedo pela metade (luz com sombra em dobro) + sombra em tom frio
uniform vec4 shadow_fill : source_color = vec4(0.40, 0.38, 0.52, 1.0);
uniform float light_scale = 0.45;

varying vec3 inst_pos;
varying vec3 wpos;

void vertex() {
	inst_pos = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	if (fade_enabled && occluder_cut(wpos, CAMERA_POSITION_WORLD, FRAGCOORD)) {
		discard;
	}
	float v = fract(sin(dot(inst_pos.xz, vec2(12.9898, 78.233))) * 43758.5453);
	vec3 base = use_instance_color ? albedo.rgb * COLOR.rgb : albedo.rgb;
	vec3 c = base * (1.0 - var_amount + v * var_amount * 2.0);
	ALBEDO = c * light_scale;
	EMISSION = c * shadow_fill.rgb + emission.rgb;
	// rugosidade baixa no modo toon = transição luz/sombra bem marcada
	ROUGHNESS = 0.3;
}
