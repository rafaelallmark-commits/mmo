// Folhagem de árvores e arbustos: cel shading com o sol global, borda clara (contraluz),
// variação de cor por instância, balanço ao vento nos vértices mais altos e "vazado" quando a
// copa fica entre a câmera e o personagem.
shader_type spatial;
render_mode unshaded;

#include "res://shaders/fade.gdshaderinc"

global uniform vec3 sun_direction;
global uniform vec4 sun_color;
global uniform vec4 ambient_tint;

uniform vec4 albedo : source_color = vec4(0.42, 0.56, 0.26, 1.0);
uniform vec4 shade : source_color = vec4(0.28, 0.40, 0.30, 1.0);
uniform vec4 rim_color : source_color = vec4(0.95, 0.92, 0.6, 1.0);
uniform float sway = 0.08;
uniform float var_amount = 0.12;

varying vec3 inst_pos;
varying vec3 wpos;

void vertex() {
	inst_pos = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = TIME * 1.3 + inst_pos.x * 0.37 + inst_pos.z * 0.21;
	float k = max(VERTEX.y, 0.0) * sway;
	VERTEX.x += sin(t) * k + sin(t * 2.7 + VERTEX.y * 3.0) * k * 0.25;
	VERTEX.z += cos(t * 0.8) * k * 0.6;
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	if (occluder_cut(wpos, CAMERA_POSITION_WORLD, FRAGCOORD)) {
		discard;
	}
	float v = fract(sin(dot(inst_pos.xz, vec2(12.9898, 78.233))) * 43758.5453);
	vec3 base = albedo.rgb * (1.0 - var_amount + v * var_amount * 2.0);
	vec3 L = normalize((VIEW_MATRIX * vec4(sun_direction, 0.0)).xyz);
	float ndl = dot(normalize(NORMAL), L) * 0.5 + 0.5;
	float lit = smoothstep(0.42, 0.52, ndl);
	// copas mais escuras embaixo (oclusão simples pela altura dentro da peça)
	float low = smoothstep(0.0, 1.0, (wpos.y - inst_pos.y) * 0.4);
	vec3 c = mix(shade.rgb * base / max(albedo.rgb, vec3(0.01)), base, lit) * (0.82 + 0.18 * low);
	float rim = smoothstep(0.62, 0.75, 1.0 - clamp(dot(normalize(NORMAL), VIEW), 0.0, 1.0)) * lit;
	ALBEDO = c * (sun_color.rgb * 0.75) + ambient_tint.rgb * base + rim * rim_color.rgb * 0.18;
}
