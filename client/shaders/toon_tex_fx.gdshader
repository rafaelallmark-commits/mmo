// toon_tex.gdshader com os efeitos do corpo (fx_body.gdshaderinc): só nas cópias de material de um personagem
// apagado (caído) ou desfazendo/formando em brasas.
shader_type spatial;
render_mode unshaded;
#define FX_BODY
#include "res://shaders/toon_tex_common.gdshaderinc"
