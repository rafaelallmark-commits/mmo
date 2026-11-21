// Contorno por casca invertida, com o mesmo "vazado" das peças de cenário (fade.gdshaderinc).
shader_type spatial;
render_mode unshaded, cull_front;

#include "res://shaders/fade.gdshaderinc"

uniform vec4 outline_color : source_color = vec4(0.12, 0.08, 0.07, 1.0);
uniform float thickness = 0.025;

varying vec3 wpos;

void vertex() {
	VERTEX += NORMAL * thickness;
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	if (occluder_cut(wpos, CAMERA_POSITION_WORLD, FRAGCOORD)) {
		discard;
	}
	ALBEDO = outline_color.rgb;
}
