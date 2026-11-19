// Terreno: mistura grama (duas cores), estrada de terra, terra/lama e pedra pelas cores dos
// vértices (R estrada, G variação, B terra/pedra) + manchas por ruído. Iluminação do próprio
// motor em modo cel (diffuse_toon), que recebe sombras corretamente.
shader_type spatial;
render_mode diffuse_toon, specular_disabled;

uniform vec4 grass_a : source_color = vec4(0.47, 0.55, 0.29, 1.0);
uniform vec4 grass_b : source_color = vec4(0.58, 0.60, 0.32, 1.0);
uniform vec4 grass_dry : source_color = vec4(0.66, 0.58, 0.36, 1.0);
uniform vec4 road : source_color = vec4(0.62, 0.50, 0.36, 1.0);
uniform vec4 road_edge : source_color = vec4(0.52, 0.42, 0.30, 1.0);
uniform vec4 dirt : source_color = vec4(0.48, 0.38, 0.30, 1.0);
uniform vec4 rock : source_color = vec4(0.50, 0.46, 0.48, 1.0);
uniform vec4 peak : source_color = vec4(0.72, 0.68, 0.80, 1.0);
// Sombra "de anime": em vez de quase preto, um tom frio. A luz direcional com sombra soma em
// dobro no renderizador de compatibilidade (medido; ver docs/DECISOES.md), então o albedo vai
// pela metade e o preenchimento entra como emissão.
uniform vec4 shadow_fill : source_color = vec4(0.40, 0.38, 0.52, 1.0);
uniform float paving = 0.0;   // 1 = ruas calçadas com pedras (cidades)
uniform float light_scale = 0.45;

varying vec3 wpos;
varying vec4 vcol;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vcol = COLOR;
}

void fragment() {
	float n1 = vnoise(wpos.xz * 0.08);
	float n2 = vnoise(wpos.xz * 0.6);
	float n3 = vnoise(wpos.xz * 2.4);
	// grama em manchas suaves com duas faixas de cor (visual de anime)
	float patch = smoothstep(0.46, 0.56, n1 * 0.7 + vcol.g * 0.3);
	vec3 g = mix(grass_a.rgb, grass_b.rgb, patch);
	g = mix(g, grass_dry.rgb, smoothstep(0.62, 0.8, n1) * 0.6);
	g *= 0.94 + 0.08 * step(0.55, n3);
	// estrada: centro claro, borda mais escura, pedrinhas
	float r = vcol.r;
	vec3 rd = mix(road_edge.rgb, road.rgb, smoothstep(0.35, 0.8, r));
	rd *= 0.92 + 0.12 * step(0.82, n3);
	if (paving > 0.5) {
		// pedras assentadas em fiadas desencontradas, com rejunte escuro
		vec2 q = wpos.xz * vec2(1.25, 1.6);
		q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
		vec2 f = fract(q);
		float joint = max(1.0 - smoothstep(0.0, 0.07, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, 0.09, min(f.y, 1.0 - f.y)));
		vec3 stone = rd * (0.88 + 0.2 * hash(floor(q)));
		rd = mix(stone, rd * 0.62, joint * smoothstep(0.45, 0.8, r));
	}
	vec3 c = mix(g, rd, smoothstep(0.25, 0.55, r));
	// terra/lama do leito e pedra das colinas
	vec3 ground = mix(dirt.rgb, rock.rgb, smoothstep(0.4, 0.7, n2));
	c = mix(c, ground * (0.9 + 0.15 * step(0.7, n3)), smoothstep(0.2, 0.6, vcol.b));
	// cumes claros na cordilheira
	c = mix(c, peak.rgb, smoothstep(30.0, 52.0, wpos.y + n2 * 6.0));
	ALBEDO = c * light_scale;
	EMISSION = c * shadow_fill.rgb;
	ROUGHNESS = 0.6;
}
