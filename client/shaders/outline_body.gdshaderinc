// Contorno por casca invertida: desenha as faces de trás, infladas pela normal. Corpo de outline.gdshader e de
// outline_fx.gdshader (FX_BODY: o contorno some junto com o corpo que se desfaz em brasas).

uniform vec4 outline_color : source_color = vec4(0.12, 0.08, 0.07, 1.0);
uniform float thickness = 0.025;

#ifdef FX_BODY
#include "res://shaders/fx_body.gdshaderinc"
#endif

void vertex() {
	VERTEX += NORMAL * thickness;
}

void fragment() {
#ifdef FX_BODY
	float fx_glow = fx_cut((INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
	if (fx_glow < 0.0) {
		discard;
	}
	ALBEDO = mix(outline_color.rgb, fx_edge.rgb * 1.6, fx_glow);
#else
	ALBEDO = outline_color.rgb;
#endif
}
