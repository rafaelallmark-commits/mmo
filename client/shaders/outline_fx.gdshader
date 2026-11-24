// outline.gdshader com os efeitos do corpo (fx_body.gdshaderinc).
shader_type spatial;
render_mode unshaded, cull_front;
#define FX_BODY
#include "res://shaders/outline_body.gdshaderinc"
