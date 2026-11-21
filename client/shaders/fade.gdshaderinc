// Peças entre a câmera e o personagem ficam "vazadas" (padrão de pontos), para nunca esconder
// quem está jogando. focus_pos é publicado por world.gd a cada quadro.
global uniform vec3 focus_pos;

const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

bool occluder_cut(vec3 wp, vec3 cam, vec4 fragcoord) {
	vec3 tgt = focus_pos + vec3(0.0, 1.1, 0.0);
	vec3 seg = tgt - cam;
	float len = length(seg);
	if (len < 0.01) {
		return false;
	}
	vec3 dirv = seg / len;
	float proj = dot(wp - cam, dirv);
	if (proj <= 0.0 || proj > len - 0.9) {
		return false;
	}
	float dist = length((wp - cam) - dirv * proj);
	float r = 2.1;
	if (dist >= r) {
		return false;
	}
	float fade = (1.0 - smoothstep(r * 0.45, r, dist)) * smoothstep(len - 0.9, len - 2.5, proj);
	int ix = int(mod(fragcoord.x, 4.0));
	int iy = int(mod(fragcoord.y, 4.0));
	return fade * 0.8 > (BAYER4[iy * 4 + ix] + 0.5) / 16.0;
}
