uniform sampler2D colorTexture;
uniform vec2 invSize;
uniform vec2 direction;
uniform float gaussianCoefficients[KERNEL_RADIUS];

varying vec2 vUv;

void main() {

	float weightSum = gaussianCoefficients[0];
	vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;

	for(int i = 1; i < KERNEL_RADIUS; i++) {

		float x = float(i);
		float w = gaussianCoefficients[i];
		vec2 uvOffset = direction * invSize * x;
		vec3 sample1 = texture2D(colorTexture, vUv + uvOffset).rgb;
		vec3 sample2 = texture2D(colorTexture, vUv - uvOffset).rgb;
		diffuseSum += (sample1 + sample2) * w;
		weightSum += 2.0 * w;

	}

	gl_FragColor = vec4(diffuseSum / weightSum, 1.0);

}

