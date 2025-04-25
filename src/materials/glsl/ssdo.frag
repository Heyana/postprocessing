#include <common>
#include <packing>

#ifdef NORMAL_DEPTH

	#ifdef GL_FRAGMENT_PRECISION_HIGH

		uniform highp sampler2D normalDepthBuffer;

	#else

		uniform mediump sampler2D normalDepthBuffer;

	#endif

	float readDepth(const in vec2 uv) {

		return texture2D(normalDepthBuffer, uv).a;

	}

#else

	uniform lowp sampler2D normalBuffer;

	#if DEPTH_PACKING == 3201

		uniform lowp sampler2D depthBuffer;

	#elif defined(GL_FRAGMENT_PRECISION_HIGH)

		uniform highp sampler2D depthBuffer;

	#else

		uniform mediump sampler2D depthBuffer;

	#endif

	float readDepth(const in vec2 uv) {

		#if DEPTH_PACKING == 3201

			return unpackRGBAToDepth(texture2D(depthBuffer, uv));

		#else

			return texture2D(depthBuffer, uv).r;

		#endif

	}

#endif

// 新增的颜色纹理采样器
#ifdef GL_FRAGMENT_PRECISION_HIGH
	uniform highp sampler2D colorBuffer;
#else
	uniform mediump sampler2D colorBuffer;
#endif

uniform lowp sampler2D noiseTexture;

uniform mat4 inverseProjectionMatrix;
uniform mat4 projectionMatrix;
uniform vec2 texelSize;
uniform vec2 cameraNearFar;

uniform float intensity;
uniform float minRadiusScale;
uniform float fade;
uniform float bias;
uniform float indirectLightIntensity; // 新增的间接光强度
uniform float indirectLightDistance; // 新增的间接光距离

uniform vec2 distanceCutoff;
uniform vec2 proximityCutoff;

varying vec2 vUv;
varying vec2 vUv2;

float getViewZ(const in float depth) {

	#ifdef PERSPECTIVE_CAMERA

		return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);

	#else

		return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);

	#endif

}

vec3 getViewPosition(const in vec2 screenPosition, const in float depth, const in float viewZ) {

	vec4 clipPosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);

	float clipW = projectionMatrix[2][3] * viewZ + projectionMatrix[3][3];
	clipPosition *= clipW; // Unproject.

	return (inverseProjectionMatrix * clipPosition).xyz;

}

// SSDO核心函数，返回直接/间接光照和遮蔽信息
// 返回值：x = 遮蔽度，y,z,w = 间接光照的RGB
vec4 getDirectionalOcclusion(const in vec3 p, const in vec3 n, const in float depth, const in vec2 uv) {

	// 距离缩放
	float radiusScale = 1.0 - smoothstep(0.0, distanceCutoff.y, depth);
	radiusScale = radiusScale * (1.0 - minRadiusScale) + minRadiusScale;
	float radius = RADIUS * radiusScale;

	// 使用随机起始角度
	float noise = texture2D(noiseTexture, vUv2).r;
	float baseAngle = noise * PI2;
	float rings = SPIRAL_TURNS * PI2;

	// 结果值
	float occlusion = 0.0;
	vec3 indirectLight = vec3(0.0);
	int taps = 0;

	for(int i = 0; i < SAMPLES_INT; ++i) {

		float alpha = (float(i) + 0.5) * INV_SAMPLES_FLOAT;
		float angle = alpha * rings + baseAngle;
		vec2 rotation = vec2(cos(angle), sin(angle));
		vec2 coords = alpha * radius * rotation * texelSize + uv;

		if(coords.s < 0.0 || coords.s > 1.0 || coords.t < 0.0 || coords.t > 1.0) {
			// 跳过屏幕外的采样点
			continue;
		}

		float sampleDepth = readDepth(coords);
		float viewZ = getViewZ(sampleDepth);

		#ifdef PERSPECTIVE_CAMERA
			float linearSampleDepth = viewZToOrthographicDepth(viewZ, cameraNearFar.x, cameraNearFar.y);
		#else
			float linearSampleDepth = sampleDepth;
		#endif

		float proximity = abs(depth - linearSampleDepth);

		if(proximity < proximityCutoff.y) {
			float falloff = 1.0 - smoothstep(proximityCutoff.x, proximityCutoff.y, proximity);

			vec3 Q = getViewPosition(coords, sampleDepth, viewZ);
			vec3 v = Q - p;

			float vv = dot(v, v);
			float vn = dot(v, n) - bias;

			// 核心SSDO逻辑: 结合AO和间接光照
			// 遮挡点计算间接光照贡献
			if(vn < 0.0) {
				// 被遮挡 - 获取采样点的颜色作为间接光照
				vec3 sampleColor = texture2D(colorBuffer, coords).rgb;
				
				// 计算衰减因子
				float f = max(RADIUS_SQ - vv, 0.0) / RADIUS_SQ;
				f = f * f * f;
				
				// 距离衰减
				float distanceAttenuation = max(0.0, 1.0 - sqrt(vv) / indirectLightDistance);
				
				// 添加间接光贡献
				// -vn表示法线与采样方向的负相关程度
				// 法线越背离采样方向，间接光贡献越大
				indirectLight += sampleColor * f * falloff * distanceAttenuation * (-vn);
				
				// 更新遮蔽值
				occlusion += f * max(-vn / (fade + vv), 0.0) * falloff;
			}
			// 未被遮挡的点对遮蔽无贡献，只考虑直接光照
			// 对于SSDO来说这部分不需要特殊处理
		}

		++taps;
	}

	// 归一化结果
	float invTaps = 1.0 / max(float(taps), 1.0);
	occlusion = occlusion * invTaps * 4.0; // 扩大遮蔽因子
	indirectLight = indirectLight * indirectLightIntensity * invTaps;

	return vec4(occlusion, indirectLight);
}

void main() {
    // 输出固定的红色，这样可以轻松看出着色器是否在运行
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
} 