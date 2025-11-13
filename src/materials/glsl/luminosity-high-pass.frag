#include <common>

uniform sampler2D tDiffuse;
uniform vec3 defaultColor;
uniform float defaultOpacity;
uniform float luminosityThreshold;
uniform float smoothWidth;

varying vec2 vUv;

void main() {

	vec4 texel = texture2D(tDiffuse, vUv);

	float v = luminance(texel.xyz);

	vec4 outputColorValue = vec4(defaultColor.rgb, defaultOpacity);

	float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);

	gl_FragColor = mix(outputColorValue, texel, alpha);

}

