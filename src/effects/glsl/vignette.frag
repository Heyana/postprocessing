uniform float offset;
uniform float darkness;
uniform vec3 color;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

	const vec2 center = vec2(0.5);
	vec3 rgb = inputColor.rgb;

	#if VIGNETTE_TECHNIQUE == 0

		float d = distance(uv, center);
		float factor = smoothstep(0.8, offset * 0.799, d * (darkness + offset));
		rgb = mix(color, rgb, factor);

	#else

		vec2 coord = (uv - center) * vec2(offset);
		float factor = dot(coord, coord);
		rgb = mix(rgb, color, darkness * factor);

	#endif

	outputColor = vec4(rgb, inputColor.a);

}
