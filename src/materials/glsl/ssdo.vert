uniform vec2 noiseScale;

varying vec2 vUv;
varying vec2 vUv2;

void main() {

	vUv = uv;
	vUv2 = uv * noiseScale;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

} 