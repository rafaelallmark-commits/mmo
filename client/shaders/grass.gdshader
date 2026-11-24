// Lâminas de grama (MultiMesh): balançam ao vento, degradê da raiz à ponta e iluminação
// própria com o sol global (como os personagens).
shader_type spatial;
render_mode unshaded, cull_disabled;

global uniform vec3 sun_direction;
global uniform vec4 sun_color;
global uniform vec4 ambient_tint;

uniform vec4 base_color : source_color = vec4(0.30, 0.42, 0.20, 1.0);
uniform vec4 tip_color : source_color = vec4(0.70, 0.76, 0.40, 1.0);
uniform vec4 dry_color : source_color = vec4(0.80, 0.70, 0.42, 1.0);
uniform float wind_strength = 0.18;
uniform float wind_speed = 1.4;

varying float tipness;
varying vec3 wpos;

void vertex() {
	tipness = UV.y;
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 inst = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float t = TIME * wind_speed;
	float gust = sin(inst.x * 0.12 + t * 0.7) * 0.5 + 0.5;
	float sway = sin(t * 2.0 + inst.x * 0.6 + inst.z * 0.4) * (0.35 + gust * 0.65);
	vec3 bend = vec3(sway, 0.0, sway * 0.4) * wind_strength * UV.y * UV.y;
	VERTEX += (inverse(MODEL_MATRIX) * vec4(bend, 0.0)).xyz;
}

void fragment() {
	float var = fract(sin(dot(floor(wpos.xz * 1.7), vec2(12.9, 78.2))) * 43758.5);
	vec3 tip = mix(tip_color.rgb, dry_color.rgb, step(0.82, var));
	vec3 c = mix(base_color.rgb, tip, smoothstep(0.0, 1.0, tipness));
	// mesma conta do terreno iluminado (sol + preenchimento frio), ponta um pouco mais clara
	float lit = 0.86 + 0.14 * tipness;
	ALBEDO = c * (lit * sun_color.rgb + vec3(0.13, 0.12, 0.2) + ambient_tint.rgb * 0.3);
}
