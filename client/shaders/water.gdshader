// Água estilizada: faixas claras que se movem.
shader_type spatial;
render_mode unshaded;

uniform vec4 deep : source_color = vec4(0.16, 0.36, 0.42, 1.0);
uniform vec4 light_band : source_color = vec4(0.55, 0.82, 0.80, 1.0);

void fragment() {
	vec2 uv = UV * 18.0;
	float w = sin(uv.x * 1.3 + TIME * 0.8) * 0.5 + sin(uv.y * 1.7 - TIME * 0.6) * 0.5;
	float band = step(0.82, w);
	ALBEDO = mix(deep.rgb, light_band.rgb, band * 0.7);
}
