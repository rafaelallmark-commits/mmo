// Água estilizada: faixas de brilho que se movem, espuma na margem (bordas do retângulo),
// leve ondulação e cor mais funda no centro.
shader_type spatial;
render_mode unshaded;

uniform vec4 deep : source_color = vec4(0.14, 0.33, 0.40, 1.0);
uniform vec4 shallow : source_color = vec4(0.30, 0.55, 0.56, 1.0);
uniform vec4 foam : source_color = vec4(0.92, 0.96, 0.94, 1.0);
uniform vec2 size = vec2(10.0, 10.0);

void vertex() {
	VERTEX.y += sin(TIME * 1.2 + VERTEX.x * 0.8) * 0.03 + cos(TIME * 0.9 + VERTEX.z * 0.6) * 0.03;
}

void fragment() {
	vec2 p = UV * size;
	vec2 edge = min(p, size - p);
	float e = min(edge.x, edge.y);
	vec3 c = mix(shallow.rgb, deep.rgb, smoothstep(0.0, 4.0, e));
	float w1 = sin(p.x * 0.9 + TIME * 0.8 + sin(p.y * 0.5) * 1.5);
	float w2 = sin(p.y * 1.1 - TIME * 0.6 + sin(p.x * 0.4) * 1.2);
	c = mix(c, shallow.rgb * 1.35, step(0.93, w1 * 0.5 + w2 * 0.5) * 0.6);
	float f = 1.0 - smoothstep(0.15, 0.7 + 0.25 * sin(TIME * 1.5 + p.x * 0.7 + p.y * 0.5), e);
	c = mix(c, foam.rgb, f);
	ALBEDO = c;
}
