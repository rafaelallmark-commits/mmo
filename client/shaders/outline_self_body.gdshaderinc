// Contorno do próprio personagem (docs/06: "o próprio personagem com contorno da cor da classe"): a mesma
// casca invertida do outline.gdshader, mas com a espessura crescendo com a distância da câmera, para ficar com
// cerca de 2 a 3 pixels tanto de perto quanto na distância normal de jogo (18 m). Os outros personagens seguem
// com o contorno escuro e fino de sempre. Corpo de outline_self.gdshader e de outline_self_fx.gdshader (FX_BODY).

uniform vec4 outline_color : source_color = vec4(1.0, 0.5, 0.2, 1.0);
uniform float min_thickness = 0.006;   // espessura mínima (de perto), em metros do modelo
uniform float per_meter = 0.0025;      // quanto engrossa por metro de distância da câmera
uniform float max_thickness = 0.06;

#ifdef FX_BODY
#include "res://shaders/fx_body.gdshaderinc"
#endif

void vertex() {
	float d = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	VERTEX += NORMAL * clamp(per_meter * d, min_thickness, max_thickness);
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
