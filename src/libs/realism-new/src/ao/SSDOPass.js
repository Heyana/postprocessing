import { AOPass } from "../../../realism-effects/src/ao/AOPass.js";
import { Vector3 } from "three";
// 导入sampleBlueNoise
import { sampleBlueNoise } from "../../index.js";

// 生成球面均匀分布的采样点
function getPointsOnSphere(n) {

	const points = [];
	const inc = Math.PI * (3 - Math.sqrt(5));
	const off = 2 / n;

	for(let k = 0; k < n; k++) {

		const y = k * off - 1 + off / 2;
		const r = Math.sqrt(1 - y * y);
		const phi = k * inc;
		points.push(new Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));

	}

	return points;

}

// SSDO片段着色器
const fragmentShader = /* glsl */`
#define GLSLIFY 1
varying vec2 vUv;

uniform sampler2D depthTexture;
uniform sampler2D normalTexture;
uniform sampler2D colorTexture;

uniform mat4 projectionViewMatrix;
uniform mat4 cameraMatrixWorld;
uniform vec2 blueNoiseRepeat;
uniform vec2 resolution;

uniform mat4 projectionMatrixInverse;
uniform float aoDistance;
uniform float distancePower;
uniform float cameraNear;
uniform float cameraFar;
uniform float bias;
uniform float thickness;
uniform int frame;
uniform vec3 samples[16];
uniform float samplesR[16];

// 间接光相关参数
uniform float indirectLightIntensity;
uniform float indirectLightDistance;
uniform bool colorBleeding;

#include <common>
#include <packing>
${sampleBlueNoise}

// 从深度获取世界空间位置
vec3 getWorldPos(const float depth, const vec2 coord) {
    float z = depth * 2.0 - 1.0;
    vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
    vec4 viewSpacePosition = projectionMatrixInverse * clipSpacePosition;
    vec4 worldSpacePosition = cameraMatrixWorld * viewSpacePosition;
    worldSpacePosition.xyz /= worldSpacePosition.w;
    return worldSpacePosition.xyz;
}

// 计算法线
vec3 computeNormal(vec3 worldPos, vec2 vUv) {
    vec2 size = vec2(textureSize(depthTexture, 0));
    ivec2 p = ivec2(vUv * size);
    
    float c0 = texelFetch(depthTexture, p, 0).x;
    float l2 = texelFetch(depthTexture, p - ivec2(2, 0), 0).x;
    float l1 = texelFetch(depthTexture, p - ivec2(1, 0), 0).x;
    float r1 = texelFetch(depthTexture, p + ivec2(1, 0), 0).x;
    float r2 = texelFetch(depthTexture, p + ivec2(2, 0), 0).x;
    float b2 = texelFetch(depthTexture, p - ivec2(0, 2), 0).x;
    float b1 = texelFetch(depthTexture, p - ivec2(0, 1), 0).x;
    float t1 = texelFetch(depthTexture, p + ivec2(0, 1), 0).x;
    float t2 = texelFetch(depthTexture, p + ivec2(0, 2), 0).x;
    
    float dl = abs((2.0 * l1 - l2) - c0);
    float dr = abs((2.0 * r1 - r2) - c0);
    float db = abs((2.0 * b1 - b2) - c0);
    float dt = abs((2.0 * t1 - t2) - c0);
    
    vec3 ce = getWorldPos(c0, vUv).xyz;
    
    vec3 dpdx = (dl < dr) ? 
        ce - getWorldPos(l1, (vUv - vec2(1.0 / size.x, 0.0))).xyz : 
        -ce + getWorldPos(r1, (vUv + vec2(1.0 / size.x, 0.0))).xyz;
    
    vec3 dpdy = (db < dt) ?
        ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / size.y))).xyz : 
        -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / size.y))).xyz;
    
    return normalize(cross(dpdx, dpdy));
}

// 线性化深度
highp float linearize_depth(highp float d, highp float zNear, highp float zFar) {
    highp float z_n = 2.0 * d - 1.0;
    return 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
}

void main() {
    float depth = textureLod(depthTexture, vUv, 0.).x;
    
    // 跳过天空盒
    if (depth == 1.0) {
        discard;
        return;
    }
    
    vec3 worldPos = getWorldPos(depth, vUv);
    vec3 normal = computeNormal(worldPos, vUv);
    
    // 随机数生成
    #ifdef animatedNoise
        int seed = frame;
    #else
        int seed = 0;
    #endif
    
    vec4 noise = sampleBlueNoise(blueNoiseTexture, seed, blueNoiseRepeat, resolution);
    
    // 创建TBN矩阵
    vec3 randomVec = normalize(noise.rgb * 2.0 - 1.0);
    vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 tbn = mat3(tangent, bitangent, normal);
    
    // 结果累积
    float occluded = 0.0;
    float totalWeight = 0.0;
    vec3 indirectLight = vec3(0.0);
    vec3 samplePos;
    
    float sppF = float(spp);
    
    for (float i = 0.0; i < sppF; i++) {
        // 获取采样方向
        vec3 sampleDirection = tbn * samples[int(i)];
        
        // 确保采样点在法线半球
        if (dot(sampleDirection, normal) < 0.0) 
            sampleDirection *= -1.0;
        
        // 随机化采样距离
        float moveAmt = samplesR[int(mod(i + noise.a * sppF, sppF))];
        samplePos = worldPos + aoDistance * moveAmt * sampleDirection;
        
        // 投影到屏幕空间
        vec4 offset = projectionViewMatrix * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xyz = offset.xyz * 0.5 + 0.5;
        
        // 获取样本深度
        float sampleDepth = textureLod(depthTexture, offset.xy, 0.0).x;
        float distSample = linearize_depth(sampleDepth, cameraNear, cameraFar);
        float distWorld = linearize_depth(offset.z, cameraNear, cameraFar);
        
        // 范围检查
        float rangeCheck = smoothstep(0.0, 1.0, aoDistance / (aoDistance * abs(distSample - distWorld)));
        rangeCheck = pow(rangeCheck, distancePower);
        
        // 权重计算
        float weight = dot(sampleDirection, normal);
        float isOccluded = sampleDepth < distWorld - bias ? 1.0 : 0.0;
        
        // 累积遮蔽
        occluded += rangeCheck * weight * isOccluded;
        totalWeight += weight;
        
        // 添加间接光 - 移除条件检查让间接光始终计算
        if (colorBleeding && isOccluded > 0.5) {
            vec3 sampleColor = texture2D(colorTexture, offset.xy).rgb;
            indirectLight += sampleColor * weight * rangeCheck;
        }
    }
    
    // 归一化结果
    float occ = clamp(1.0 - occluded / totalWeight, 0.0, 1.0);
    indirectLight = indirectLight * indirectLightIntensity / sppF;
    
    // 输出: r通道为AO值，gba通道为间接光
    gl_FragColor = vec4(1.0 - occ, indirectLight);
}
`;

export class SSDOPass extends AOPass {

	constructor(camera, scene) {

		// 将着色器中的包含指令替换为实际的GLSL代码
		const processedFragmentShader = fragmentShader;

		super(camera, scene, processedFragmentShader);

		// 添加SSDO特有的Uniforms
		this.fullscreenMaterial.uniforms.colorTexture = { value: null };
		this.fullscreenMaterial.uniforms.indirectLightIntensity = { value: 1.0 };
		this.fullscreenMaterial.uniforms.indirectLightDistance = { value: 1.0 };
		this.fullscreenMaterial.uniforms.colorBleeding = { value: true };

		// 设置默认采样数
		this.fullscreenMaterial.defines.spp = "16";

		// 添加颜色纹理使用的定义
		this.fullscreenMaterial.defines.USE_COLOR_TEXTURE = "";

		// 更新材质以应用新的宏定义
		this.fullscreenMaterial.needsUpdate = true;

		// 初始化采样点
		this.setSamples(16);

	}

	setSamples(count) {

		// 生成球面采样点
		const samples = getPointsOnSphere(count);
		const samplesR = [];

		for(let i = 0; i < count; i++) {

			samplesR.push((i + 1) / count);

		}

		this.fullscreenMaterial.uniforms.samples = { value: samples };
		this.fullscreenMaterial.uniforms.samplesR = { value: samplesR };
		this.fullscreenMaterial.defines.spp = count.toFixed(0);
		this.fullscreenMaterial.needsUpdate = true;

	}

}
