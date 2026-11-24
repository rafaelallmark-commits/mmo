// Contorno por casca invertida: desenha as faces de trás, infladas pela normal (corpo em outline_body.gdshaderinc).
shader_type spatial;
render_mode unshaded, cull_front;
#include "res://shaders/outline_body.gdshaderinc"
