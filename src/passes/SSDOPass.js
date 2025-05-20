import { BasicDepthPacking, RepeatWrapping, RGBAFormat, Uniform, WebGLRenderTarget } from "three";
import { NoiseTexture } from "../textures/NoiseTexture.js";
import { Pass } from "./Pass.js";

const NOISE_TEXTURE_SIZE = 64;

/**
 * 屏幕空间方向性遮蔽通道
 * 实现SSDO效果的核心逻辑
 */
export class SSDOPass extends Pass {

	/**
     * 创建一个SSDO通道
     *
     * @param {Camera} camera - 相机
     * @param {Texture} normalBuffer - 法线纹理
     * @param {Texture} colorBuffer - 颜色纹理
     */
	constructor(camera, normalBuffer, colorBuffer) {

		super("SSDOPass");

		this.needsSwap = false;

		/**
         * 渲染目标
         * @type {WebGLRenderTarget}
         * @private
         */
		this._renderTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
		this._renderTarget.texture.name = "SSDO.Target";

		/**
         * SSDO材质
         * @private
         */
		this._ssdomaterial = new SSDOMaterial(camera);
		this._ssdomaterial.normalBuffer = normalBuffer;
		this._ssdomaterial.colorBuffer = colorBuffer;

		// 创建并配置噪声纹理
		const noiseTexture = new NoiseTexture(NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, RGBAFormat);
		noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;
		this._ssdomaterial.noiseTexture = noiseTexture;

		// 设置全屏材质
		this.fullscreenMaterial = this._ssdomaterial;

	}

	/**
     * 获取SSDO纹理
     * @type {Texture}
     */
	get texture() {

		return this._renderTarget.texture;

	}

	/**
     * 设置大小
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		this._renderTarget.setSize(width, height);
		this._ssdomaterial.setSize(width, height);

	}

	/**
     * 渲染通道
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲
     */
	render(renderer, inputBuffer, outputBuffer) {

		// 渲染SSDO效果到内部的渲染目标
		renderer.setRenderTarget(this._renderTarget);
		renderer.render(this.scene, this.camera);
		renderer.setRenderTarget(null);

	}

}

/**
 * SSDO材质类
 * 实现屏幕空间方向性遮蔽的着色器逻辑
 */
class SSDOMaterial extends ShaderMaterial {

	/**
     * 创建SSDO材质
     * @param {Camera} camera - 相机
     */
	constructor(camera) {

		super({
			name: "SSDO",
			defines: {
				SPIRAL_TURNS: "7.0",
				SAMPLES: "16"
			},
			uniforms: {
				// 输入纹理
				normalBuffer: new Uniform(null),
				depthBuffer: new Uniform(null),
				colorBuffer: new Uniform(null),
				noiseTexture: new Uniform(null),

				// 相机参数
				cameraNearFar: new Uniform(new Vector2(0.1, 1000.0)),
				cameraProjectionMatrix: new Uniform(new Matrix4()),
				cameraInverseProjectionMatrix: new Uniform(new Matrix4()),

				// SSDO参数
				bias: new Uniform(0.025),
				radius: new Uniform(0.18),
				fade: new Uniform(0.01),
				minRadiusScale: new Uniform(0.1),
				worldDistanceThreshold: new Uniform(0.018),
				worldDistanceFalloff: new Uniform(0.006),
				worldProximityThreshold: new Uniform(0.0004),
				worldProximityFalloff: new Uniform(0.0008),

				// 间接光照参数
				indirectLightIntensity: new Uniform(1.0),
				indirectLightDistance: new Uniform(1.0),

				// 采样参数
				samples: new Uniform(null),
				samplesR: new Uniform(null),

				// 屏幕和纹理参数
				texelSize: new Uniform(new Vector2()),
				resolution: new Uniform(new Vector2())
			},
			fragmentShader: `
            #include <common>
            #include <packing>

            uniform sampler2D normalBuffer;
            uniform sampler2D depthBuffer;
            uniform sampler2D colorBuffer;
            uniform sampler2D noiseTexture;

            uniform vec2 cameraNearFar;
            uniform mat4 cameraProjectionMatrix;
            uniform mat4 cameraInverseProjectionMatrix;

            uniform float bias;
            uniform float radius;
            uniform float fade;
            uniform float minRadiusScale;
            
            uniform float worldDistanceThreshold;
            uniform float worldDistanceFalloff;
            uniform float worldProximityThreshold;
            uniform float worldProximityFalloff;

            uniform float indirectLightIntensity;
            uniform float indirectLightDistance;

            uniform vec3 samples[SAMPLES];
            uniform float samplesR[SAMPLES];
            
            uniform vec2 texelSize;
            uniform vec2 resolution;

            varying vec2 vUv;
            varying vec2 vUv2;

            // 从深度值计算视图空间Z坐标
            float getViewZ(float depth) {
                #ifdef PERSPECTIVE_CAMERA
                    return perspectiveDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
                #else
                    return orthographicDepthToViewZ(depth, cameraNearFar.x, cameraNearFar.y);
                #endif
            }

            // 从屏幕坐标和深度值计算视图空间位置
            vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
                float viewZ = getViewZ(depth);
                vec4 clipPosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
                vec4 viewPosition = cameraInverseProjectionMatrix * clipPosition;
                return viewPosition.xyz / viewPosition.w;
            }

            // 将法线从RGB编码转换回向量形式
            vec3 unpackNormal(vec3 packedNormal) {
                return packedNormal * 2.0 - 1.0;
            }

            // SSDO核心函数，返回遮蔽度和间接光
            // x - 遮蔽度，y,z,w - 间接光颜色
            vec4 computeSSDirectionalOcclusion(vec3 viewPosition, vec3 viewNormal, float depth) {
                // 根据深度缩放采样半径
                float radiusScale = 1.0 - smoothstep(0.0, worldDistanceFalloff, depth);
                radiusScale = radiusScale * (1.0 - minRadiusScale) + minRadiusScale;
                float finalRadius = radius * radiusScale;
                
                // 为采样设置随机旋转
                float noise = texture2D(noiseTexture, vUv2).r;
                float randomAngle = noise * PI2;
                
                // 创建旋转矩阵，围绕法线旋转
                vec3 bitangent = normalize(cross(vec3(0.0, 1.0, 0.0), viewNormal));
                if (length(bitangent) < 0.1) {
                    bitangent = normalize(cross(vec3(0.0, 0.0, 1.0), viewNormal));
                }
                vec3 tangent = normalize(cross(viewNormal, bitangent));
                mat3 kernelMatrix = mat3(tangent, bitangent, viewNormal);
                
                // 累积结果
                float occlusion = 0.0;
                vec3 indirectLight = vec3(0.0);
                
                // 执行采样
                for (int i = 0; i < SAMPLES; i++) {
                    // 获取旋转后的采样向量
                    vec3 sampleDir = kernelMatrix * samples[i];
                    
                    // 确保采样位于法线所在半球
                    float NdotS = dot(viewNormal, sampleDir);
                    if (NdotS < 0.0) {
                        sampleDir = -sampleDir;
                        NdotS = -NdotS;
                    }
                    
                    // 缩放半径
                    float sampleRadius = samplesR[i] * finalRadius;
                    
                    // 计算采样点的屏幕空间位置
                    vec3 samplePos = viewPosition + sampleDir * sampleRadius;
                    vec4 sampleClipPos = cameraProjectionMatrix * vec4(samplePos, 1.0);
                    vec2 sampleUV = (sampleClipPos.xy / sampleClipPos.w) * 0.5 + 0.5;
                    
                    // 跳过屏幕外的采样点
                    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
                        continue;
                    }
                    
                    // 读取采样点的深度
                    float sampleDepth = texture2D(depthBuffer, sampleUV).r;
                    float sampleViewZ = getViewZ(sampleDepth);
                    vec3 sampleViewPos = getViewPosition(sampleUV, sampleDepth);
                    
                    // 计算采样点到当前点的向量
                    vec3 dirToSample = sampleViewPos - viewPosition;
                    float distToSample = length(dirToSample);
                    
                    // 把采样点与当前点视为相交，计算遮蔽和间接光
                    if (distToSample > 0.0001 && distToSample < indirectLightDistance) {
                        float falloffFactor = 1.0 - smoothstep(0.0, indirectLightDistance, distToSample);
                        
                        // 读取采样点的颜色
                        vec3 sampleColor = texture2D(colorBuffer, sampleUV).rgb;
                        
                        // 使用余弦加权计算间接光贡献
                        float weight = NdotS * falloffFactor;
                        indirectLight += sampleColor * weight;
                        
                        // 如果采样点在当前点前面，则其遮蔽当前点
                        if (sampleViewPos.z < viewPosition.z - bias) {
                            float factor = smoothstep(0.0, 1.0, (finalRadius - distToSample) / finalRadius);
                            occlusion += factor * weight;
                        }
                    }
                }
                
                // 标准化结果
                occlusion = clamp(occlusion, 0.0, 1.0);
                indirectLight = indirectLight * indirectLightIntensity / float(SAMPLES);
                
                return vec4(occlusion, indirectLight);
            }

            void main() {
                // 获取法线和深度
                vec3 viewNormal = unpackNormal(texture2D(normalBuffer, vUv).rgb);
                float depth = texture2D(depthBuffer, vUv).r;
                
                // 转换深度阈值
                float linearDepth = depth;
                #ifdef PERSPECTIVE_CAMERA
                    float viewZ = getViewZ(depth);
                    linearDepth = viewZToOrthographicDepth(viewZ, cameraNearFar.x, cameraNearFar.y);
                #endif
                
                vec4 aoIndirect = vec4(0.0);
                
                // 计算SSDO
                if (linearDepth < worldDistanceThreshold) {
                    // 获取视图空间位置
                    vec3 viewPosition = getViewPosition(vUv, depth);
                    
                    // 计算方向性遮蔽和间接光
                    aoIndirect = computeSSDirectionalOcclusion(viewPosition, viewNormal, linearDepth);
                    
                    // 距离衰减
                    float d = smoothstep(worldDistanceThreshold - worldDistanceFalloff, worldDistanceThreshold, linearDepth);
                    aoIndirect *= (1.0 - d);
                }
                
                // 输出SSDO结果:
                // r = 遮蔽度 (0-1)
                // gba = 间接光颜色
                gl_FragColor = aoIndirect;
            }
            `,
			vertexShader: `
            uniform vec2 texelSize;

            varying vec2 vUv;
            varying vec2 vUv2;

            void main() {
                vUv = uv;
                vUv2 = uv * vec2(${NOISE_TEXTURE_SIZE}) * texelSize;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
            `
		});

		this.toneMapped = false;
		this.depthPacking = BasicDepthPacking;

		// 如果提供了相机，设置相机参数
		if(camera) {

			this.copyCameraSettings(camera);

		}

	}

	/**
     * 复制相机设置
     * @param {Camera} camera - 相机
     */
	copyCameraSettings(camera) {

		if(camera) {

			this.uniforms.cameraNearFar.value.set(camera.near, camera.far);
			this.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
			this.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);

		}

	}

	/**
     * 设置大小
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		this.uniforms.texelSize.value.set(1.0 / width, 1.0 / height);
		this.uniforms.resolution.value.set(width, height);

	}

}

// 导入缺失的依赖
import { Matrix4, ShaderMaterial, Vector2 } from "three";
