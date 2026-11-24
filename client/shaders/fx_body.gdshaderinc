// Efeitos do corpo inteiro de um personagem (D186), só nas variantes *_fx dos shaders (FX_BODY definido):
// apagado (caído) e desfazer/formar em brasas (teleporte, renascer, chegada ao mapa). O renderizador de
// compatibilidade não tem uniformes por instância, então o personagem troca os materiais compartilhados por
// cópias com estas variantes enquanto o efeito dura e volta aos compartilhados no fim (vrm_character.gd,
// _fx_set): os outros personagens e o cenário seguem com os shaders de sempre.
uniform float fx_fade = 0.0;       // 0 = cor normal, 1 = apagado (sem parte da cor, um pouco mais escuro)
uniform float fx_dissolve = 0.0;   // 0 = inteiro, 1 = desfeito
uniform vec4 fx_edge : source_color = vec4(1.0, 0.62, 0.25, 1.0); // brasa na borda do que some
uniform vec3 fx_base = vec3(0.0);  // pés do personagem (mundo)
uniform float fx_up = 1.0;         // 1: some primeiro pelos pés (e se forma pela cabeça); -1: o contrário
uniform float fx_height = 2.0;     // altura do corpo (m), para a mistura com a altura

float fx_hash(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.x + p.y) * p.z);
}

// 0..1 por ponto do mundo: ruído em células de ~4 cm (as brasas) misturado com a altura no corpo.
float fx_value(vec3 wp) {
	float n = fx_hash(floor(wp * 24.0));
	float h = clamp((wp.y - fx_base.y) / fx_height, 0.0, 1.0);
	if (fx_up < 0.0) {
		h = 1.0 - h;
	}
	return mix(n, h, 0.55);
}

// Desfazer: brilho da borda (0..1) ou -1 para o que já sumiu (quem chama descarta: discard só vale no fragment()).
// Em fx_dissolve = 1 não sobra nada.
float fx_cut(vec3 wp) {
	if (fx_dissolve <= 0.0) {
		return 0.0;
	}
	float v = fx_value(wp);
	float th = fx_dissolve * 1.1;
	if (v < th) {
		return -1.0;
	}
	return 1.0 - smoothstep(th, th + 0.09, v);
}

// Caído: perde parte da cor e escurece um pouco.
vec3 fx_color(vec3 c) {
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	return mix(c, vec3(l) * 0.78, fx_fade * 0.6);
}
