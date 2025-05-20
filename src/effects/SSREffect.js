import * as THREE from "three";
import {
	BasicDepthPacking,
	Color,
	DepthFormat,
	HalfFloatType,
	LinearFilter,
	LinearSRGBColorSpace,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshNormalMaterial,
	NearestFilter,
	NoBlending,
	OrthographicCamera,
	RGBADepthPacking,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	SRGBColorSpace,
	Uniform,
	UniformsUtils,
	UnsignedByteType,
	UnsignedShortType,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	WebGLMultipleRenderTargets,
	DepthTexture,
	BufferGeometry,
	Float32BufferAttribute
} from "three";

import { BlurPass, ClearPass, Effect, EffectAttribute, Pass, RenderPass, ShaderPass, NormalPass } from "postprocessing";
import { SSRShader, BlurShaderUtils } from "../shaders/SSRShader.js";

const NORMAL_RENDER_TARGET = new WeakMap();
const METALNESS_RENDER_TARGET = new WeakMap();

/**
 * Screen Space Reflection Effect.
 *
 * This effect uses normal and depth buffers to create screen space reflections.
 * Adapted from ThreeJS's SSRPass to work with the post-processing library.
 */
export class SSREffect extends Effect {

	/**
     * Constructs a new SSREffect.
     *
     * @param {Scene} scene - The scene.
     * @param {Camera} camera - The camera.
     * @param {Object} [options] - The options.
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - The blend function of this effect.
     * @param {Number} [options.thickness=0.018] - The thickness of the reflections.
     * @param {Number} [options.maxDistance=0.1] - Maximum reflection distance.
     * @param {Number} [options.opacity=0.85] - Reflection opacity.
     * @param {Boolean} [options.fresnel=true] - Whether to enable the Fresnel effect.
     * @param {Boolean} [options.distanceAttenuation=true] - Whether to attenuate reflection based on distance.
     * @param {Boolean} [options.infiniteThick=false] - Whether to use infinite thickness.
     * @param {Boolean} [options.bouncing=true] - Whether the reflection rays can bounce on surfaces.
     * @param {Boolean} [options.blur=true] - Whether to blur the reflections.
     * @param {Number} [options.blurKernelSize=1] - The blur kernel size.
     * @param {Number} [options.resolutionScale=0.5] - The resolution scale.
     * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - The horizontal resolution.
     * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - The vertical resolution.
     * @param {Number} [options.multisampling=0] - The number of samples.
     */
	constructor(scene, camera, options = {}) {

		// 确保参数有默认值
		const settings = Object.assign({
			blendFunction: undefined,
			thickness: 0.018,
			maxDistance: 0.1,
			opacity: 0.85,
			fresnel: true,
			distanceAttenuation: true,
			infiniteThick: false,
			bouncing: true,
			blur: true,
			blurKernelSize: 1,
			resolutionScale: 0.5,
			resolutionX: undefined,
			resolutionY: undefined,
			multisampling: 0,
			groundReflector: null
		}, options);

		try {

			// Load the fragment shader with correct Effect structure
			const fragmentShader = `
                uniform sampler2D tSSR;
                uniform sampler2D tNormal;
                uniform float opacity;
                
                void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
                    // 获取原始场景颜色
                    vec4 sceneColor = inputColor;
                    
                    // 获取SSR渲染的结果
                    vec4 ssrColor = texture2D(tSSR, uv);
                    
                    // 获取法线信息，用于判断是否应该应用反射
                    vec4 normalData = texture2D(tNormal, uv);
                    vec3 normal = normalize(normalData.rgb * 2.0 - 1.0);
                    
                    // 计算反射因子
                    float reflectionFactor = opacity;
                    
                    // 如果法线为零，表示这是背景，不应用反射
                    if (length(normal) < 0.1) {
                        reflectionFactor = 0.0;
                    }
                    
                    // 基于法线方向计算菲涅尔效应（观察角度越斜，反射越强）
                    float viewDotNormal = abs(normal.z); // z方向是指向相机的方向
                    float fresnel = pow(1.0 - viewDotNormal, 5.0);
                    
                    // 将菲涅尔效应与基础反射因子结合
                    reflectionFactor *= mix(0.5, 1.0, fresnel);
                    
                    // 应用SSR颜色的alpha值来调整反射强度
                    reflectionFactor *= ssrColor.a;
                    
                    // 混合原始场景颜色和SSR结果
                    outputColor = mix(sceneColor, vec4(ssrColor.rgb, 1.0), reflectionFactor);
                }
            `;

			console.log("SSREffect: 初始化Effect基类");

			super("SSREffect", fragmentShader, {
				blendFunction: settings.blendFunction,
				uniforms: new Map([
					["tSSR", new Uniform(null)],
					["tNormal", new Uniform(null)],
					["opacity", new Uniform(settings.opacity)]
				])
			});

			console.log("SSREffect: Effect基类初始化完成");

			// 保存分辨率缩放因子（移到super()之后）
			this._resolutionScale = settings.resolutionScale;

			// Required parameters
			this.scene = scene;
			this.camera = camera;

			// Settings
			this._thickness = settings.thickness;
			this._maxDistance = settings.maxDistance;
			this._fresnel = settings.fresnel;
			this._distanceAttenuation = settings.distanceAttenuation;
			this._infiniteThick = settings.infiniteThick;
			this._opacity = settings.opacity;
			this._bouncing = settings.bouncing;
			this._blur = settings.blur;
			this._blurKernelSize = settings.blurKernelSize;
			this._groundReflector = settings.groundReflector;
			this.selection = new Set();

			// Resolution
			this.resolution = new Vector2();
			const resolution = this.resolution;
			resolution.set(settings.resolutionX, settings.resolutionY);

			// 设置渲染目标 - 明确创建深度纹理
			this.renderTargetNormal = new WebGLRenderTarget(resolution.x || 1, resolution.y || 1, {
				minFilter: NearestFilter,
				magFilter: NearestFilter,
				format: RGBAFormat,
				depthBuffer: true, // 确保启用深度缓冲
				stencilBuffer: false
			});

			// 显式创建深度纹理
			this.renderTargetNormal.depthTexture = new DepthTexture(resolution.x || 1, resolution.y || 1);
			this.renderTargetNormal.depthTexture.format = DepthFormat;
			this.renderTargetNormal.depthTexture.type = UnsignedShortType;
			this.renderTargetNormal.texture.name = "SSR.Normal";

			try {

				// 创建NormalPass
				console.log("SSREffect: 创建NormalPass，camera=", camera, "scene=", scene);
				this.normalPass = new NormalPass(this.scene, this.camera, {
					resolutionScale: settings.resolutionScale,
					width: resolution.x || 1,
					height: resolution.y || 1
				});

				// 确保NormalPass可以访问renderTargetNormal的depthTexture
				console.log("SSREffect: 检查是否需要将depthTexture附加到normalPass");
				if(this.normalPass.texture && !this.normalPass.texture.depthTexture) {

					console.log("SSREffect: 将renderTargetNormal.depthTexture附加到normalPass.texture");
					this.normalPass.texture.depthTexture = this.renderTargetNormal.depthTexture;

				}

			} catch(error) {

				console.error("SSREffect: 创建NormalPass失败，使用备用方法", error);
				// 创建基本的NormalPass替代品
				this.normalPass = {
					texture: this.renderTargetNormal.texture,
					renderTarget: this.renderTargetNormal,
					render: (renderer, inputBuffer, outputBuffer) => {

						// 基本实现 - 只使用已有的renderTargetNormal
						const scene = this.scene;
						const camera = this.camera;
						const currentRenderTarget = renderer.getRenderTarget();
						const currentAutoClear = renderer.autoClear;
						const currentClearColor = renderer.getClearColor(new Color());
						const currentClearAlpha = renderer.getClearAlpha();

						renderer.setRenderTarget(this.renderTargetNormal);
						renderer.autoClear = true;
						renderer.setClearColor(0x7777ff);
						renderer.setClearAlpha(1.0);

						// 使用法线材质渲染场景
						const overrideMaterial = scene.overrideMaterial;
						scene.overrideMaterial = new MeshNormalMaterial({
							normalScale: new Vector2(1, 1),
							flatShading: false
						});

						renderer.render(scene, camera);

						// 恢复场景状态
						scene.overrideMaterial = overrideMaterial;

						// 恢复渲染器状态
						renderer.setRenderTarget(currentRenderTarget);
						renderer.autoClear = currentAutoClear;
						renderer.setClearColor(currentClearColor);
						renderer.setClearAlpha(currentClearAlpha);

						console.log("使用备用NormalPass渲染完成");

					},
					setSize: (width, height) => {

						console.log("SSREffect: 使用备用normalPass.setSize", width, height);
						if(this.renderTargetNormal) {

							this.renderTargetNormal.setSize(width, height);
							if(this.renderTargetNormal.depthTexture) {

								this.renderTargetNormal.depthTexture.image.width = width;
								this.renderTargetNormal.depthTexture.image.height = height;

							}

						}

					},
					dispose: () => {

						console.log("SSREffect: 使用备用normalPass.dispose");
						// 不处理，因为renderTargetNormal将在SSREffect.dispose中处理

					}
				};
				// 确保texture和depthTexture可用
				this.normalPass.texture = this.renderTargetNormal.texture;
				this.normalPass.texture.depthTexture = this.renderTargetNormal.depthTexture;

			}

			// Setup our passes
			this.setupPasses(settings);

			// Set attributes
			this.attributes = EffectAttribute.DEPTH;

			// 最终检查：确保所有必需的渲染目标和材质都已设置
			this.validateSetup();

		} catch(error) {

			console.error("Failed to create SSR effect:", error);
			throw error; // 重新抛出错误，以便调用者知道发生了错误

		}

	}

	/**
     * 验证SSREffect设置的完整性
     * @private
     */
	validateSetup() {

		// 检查渲染目标
		if(!this.renderTargetNormal) {

			console.warn("SSREffect: renderTargetNormal is missing");

		}
		if(!this.renderTargetSSR) {

			console.warn("SSREffect: renderTargetSSR is missing");

		}
		if(!this.renderTargetMetalness) {

			console.warn("SSREffect: renderTargetMetalness is missing");

		}

		// 检查通道
		if(!this.normalPass) {

			console.warn("SSREffect: normalPass is missing");

		}
		if(!this.ssrPass) {

			console.warn("SSREffect: ssrPass is missing");

		}

		// 检查材质
		if(!this.ssrMaterial) {

			console.warn("SSREffect: ssrMaterial is missing");

		}

		// 检查uniform纹理引用
		const uniforms = this.uniforms;
		if(!uniforms.has("tSSR")) {

			console.warn("SSREffect: tSSR uniform is missing");

		} else if(!uniforms.get("tSSR").value) {

			console.warn("SSREffect: tSSR uniform value is null");

		}

		if(!uniforms.has("tNormal")) {

			console.warn("SSREffect: tNormal uniform is missing");

		} else if(!uniforms.get("tNormal").value) {

			console.warn("SSREffect: tNormal uniform value is null");

		}

		console.log("SSREffect setup validation complete");

	}

	/**
     * Sets up passes for the effect.
     *
     * @param {Object} settings - The settings.
     * @private
     */
	setupPasses(settings) {

		const resolution = this.resolution;

		// 创建一个全屏渲染用的quad
		if(!this.quad) {

			console.log("SSREffect: 创建全屏渲染quad");
			// 使用BufferGeometry创建一个平面作为渲染目标
			const geometry = new BufferGeometry();
			geometry.setAttribute(
				"position",
				new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
			);
			geometry.setAttribute(
				"uv",
				new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2)
			);
			this.quad = new Mesh(geometry);
			this.quad.frustumCulled = false;

		}

		// Create render targets
		this.renderTargetBeauty = new WebGLRenderTarget(resolution.x, resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		});

		this.renderTargetBeauty.texture.name = "SSR.Beauty";

		this.renderTargetMetalness = new WebGLRenderTarget(resolution.x, resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		});

		this.renderTargetMetalness.texture.name = "SSR.Metalness";

		// 确保深度纹理格式正确
		this.renderTargetNormal.depthTexture.format = DepthFormat;
		this.renderTargetNormal.depthTexture.type = UnsignedShortType;

		// Setup ssrMaterial
		this.ssrMaterial = new ShaderMaterial({
			defines: Object.assign({}, SSRShader.defines, {
				MAX_STEP: 16,
				MAX_DISTANCE: settings.maxDistance.toFixed(6),
				THICKNESS: settings.thickness.toFixed(6),
				INFINITE_THICK: settings.infiniteThick
			}),
			uniforms: UniformsUtils.clone(SSRShader.uniforms),
			vertexShader: SSRShader.vertexShader,
			fragmentShader: SSRShader.fragmentShader,
			blending: NoBlending
		});

		console.log("SSREffect: 着色器初始化成功", {
			define_MAX_STEP: this.ssrMaterial.defines.MAX_STEP,
			MAX_DISTANCE: this.ssrMaterial.defines.MAX_DISTANCE,
			THICKNESS: this.ssrMaterial.defines.THICKNESS
		});

		// 确保为矩阵和向量提供默认值，防止null引用
		if(!this.ssrMaterial.uniforms.reflectorMatrix.value) {

			this.ssrMaterial.uniforms.reflectorMatrix.value = new Matrix4();

		}

		if(!this.ssrMaterial.uniforms.reflectorNormal.value) {

			this.ssrMaterial.uniforms.reflectorNormal.value = new Vector3(0, 1, 0);

		}

		if(!this.ssrMaterial.uniforms.view.value) {

			this.ssrMaterial.uniforms.view.value = new Matrix4();

		}

		if(!this.ssrMaterial.uniforms.viewInverse.value) {

			this.ssrMaterial.uniforms.viewInverse.value = new Matrix4();

		}

		if(!this.ssrMaterial.uniforms.projection.value) {

			this.ssrMaterial.uniforms.projection.value = new Matrix4();

		}

		if(!this.ssrMaterial.uniforms.projectionInverse.value) {

			this.ssrMaterial.uniforms.projectionInverse.value = new Matrix4();

		}

		this.ssrMaterial.uniforms.opacity.value = settings.opacity;
		this.ssrMaterial.uniforms.maxDistance.value = settings.maxDistance;
		this.ssrMaterial.uniforms.thickness.value = settings.thickness;
		this.ssrMaterial.defines.MAX_DISTANCE = settings.maxDistance.toFixed(6);
		this.ssrMaterial.defines.THICKNESS = settings.thickness.toFixed(6);
		this.ssrMaterial.defines.INFINITE_THICK = settings.infiniteThick ? 1 : 0;
		this.ssrMaterial.defines.FRESNEL = settings.fresnel ? 1 : 0;
		this.ssrMaterial.defines.DISTANCE_ATTENUATION = settings.distanceAttenuation ? 1 : 0;
		this.ssrMaterial.defines.BOUNCING = settings.bouncing ? 1 : 0;
		this.ssrMaterial.needsUpdate = true;

		// Create the SSR render target
		this.renderTargetSSR = new WebGLRenderTarget(resolution.x, resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		});
		this.renderTargetSSR.texture.name = "SSR.Reflection";

		// Setup material for reflective objects
		this.metalnessOnMaterial = new MeshBasicMaterial({
			color: new Color(0xffffff),
			transparent: true
		});

		this.metalnessOffMaterial = new MeshBasicMaterial({
			color: new Color(0x000000),
			transparent: true
		});

		this.originalMaterials = new Map();

		// Setup the blur pass
		if(this._blur) {

			try {

				// 创建自定义BlurPass，不再使用KawaseBlurPass
				this.blurPass = new BlurPass({
					kernelSize: this._blurKernelSize,
					resolutionScale: 1.0,
					width: resolution.x || 1,
					height: resolution.y || 1
				});

				this.blurPass.enabled = this._blur;

				// 创建一个新的渲染目标用于模糊处理
				this.renderTargetBlur = new WebGLRenderTarget(resolution.x, resolution.y, {
					minFilter: LinearFilter,
					magFilter: LinearFilter,
					format: RGBAFormat,
					stencilBuffer: false
				});
				this.renderTargetBlur.texture.name = "SSR.Blurred";

			} catch(error) {

				console.error("Failed to create BlurPass:", error);
				// 如果创建BlurPass失败，禁用模糊效果
				this._blur = false;

			}

		}

		// Set the SSR render pass
		this.ssrPass = new ShaderPass(this.ssrMaterial);

		// Update uniform references
		this.uniforms.get("tSSR").value = this._blur ?
			this.renderTargetBlur.texture :
			this.renderTargetSSR.texture;

		this.uniforms.get("tNormal").value = this.normalPass.texture;

	}

	/**
     * Updates the effect.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     */
	update(renderer, inputBuffer, deltaTime) {

		if(!renderer || !inputBuffer) {

			console.warn("SSREffect: Missing required parameters in update method");
			return;

		}

		try {

			console.log("SSREffect.update: Starting update with inputBuffer:", inputBuffer);
			const { scene, camera } = this;

			// 首先确保normalPass已经渲染
			if(this.normalPass) {

				console.log("SSREffect: Rendering normal pass");
				this.normalPass.render(renderer, inputBuffer, null);

			} else {

				console.error("SSREffect: normalPass is not initialized");
				return;

			}

			// 验证normal texture和depthTexture
			if(!this.normalPass.texture) {

				console.error("SSREffect: normalPass texture is not available");
				return;

			}

			if(!this.normalPass.texture.depthTexture) {

				console.error("SSREffect: normalPass depthTexture is not available");
				return;

			}

			const { uniforms } = this.ssrMaterial;

			if(this.selection.size > 0) {

				// Store original materials
				this.storeOriginalMaterials();

				// Set reflection material on selected objects
				this.setSelectionToReflectiveMaterial();

				// Generate metalness map
				this.renderMetalnessMap(renderer);

				// 添加调试信息，检查metalness图是否有效
				console.log("SSREffect: 渲染了metalness图, 选择集大小:", this.selection.size);

				// Restore original materials
				this.restoreOriginalMaterials();

			} else {

				console.warn("SSREffect: 选择集为空，没有反射对象!");

			}

			// Update SSR uniforms
			uniforms.tDepth.value = this.normalPass.texture.depthTexture;
			uniforms.tNormal.value = this.normalPass.texture;
			uniforms.tMetalness.value = this.renderTargetMetalness.texture;
			uniforms.tDiffuse.value = inputBuffer.texture;

			// 添加更多的纹理状态日志
			console.log("SSREffect uniform纹理状态:", {
				tDepth: uniforms.tDepth.value ? "已设置" : "未设置",
				tNormal: uniforms.tNormal.value ? "已设置" : "未设置",
				tMetalness: uniforms.tMetalness.value ? "已设置" : "未设置",
				tDiffuse: uniforms.tDiffuse.value ? "已设置" : "未设置",
				depthTexture存在: this.normalPass.texture && this.normalPass.texture.depthTexture ? "是" : "否"
			});

			if(camera) {

				// 更新相机相关的矩阵
				try {

					// 设置相机的近平面和远平面
					if(uniforms.cameraNear) {

						uniforms.cameraNear.value = camera.near;

					}

					if(uniforms.cameraFar) {

						uniforms.cameraFar.value = camera.far;

					}

					if(uniforms.cameraRange) {

						uniforms.cameraRange.value = camera.far - camera.near;

					}

					if(uniforms.projection && uniforms.projectionInverse) {

						if(camera.projectionMatrix) {

							uniforms.projection.value.copy(camera.projectionMatrix);
							uniforms.projectionInverse.value.copy(camera.projectionMatrix).invert();

						} else {

							console.warn("SSREffect: Camera has no projectionMatrix");

						}

					}

					if(uniforms.view && uniforms.viewInverse) {

						if(camera.matrixWorldInverse && camera.matrixWorld) {

							uniforms.view.value.copy(camera.matrixWorldInverse);
							uniforms.viewInverse.value.copy(camera.matrixWorld);

						} else {

							console.warn("SSREffect: Camera has no matrixWorldInverse or matrixWorld");

						}

					}

				} catch(error) {

					console.error("Error updating camera matrices:", error);

				}

			} else {

				console.warn("SSREffect: No camera provided");

			}

			// Handle ground reflector if present
			if(this._groundReflector) {

				try {

					uniforms.hasReflector.value = 1;
					if(uniforms.reflectorMatrix && this._groundReflector.matrixWorld) {

						// 确保reflectorMatrix.value不为null
						if(uniforms.reflectorMatrix.value === null) {

							console.warn("SSREffect: reflectorMatrix.value是null，正在创建新矩阵");
							uniforms.reflectorMatrix.value = new Matrix4();

						}
						uniforms.reflectorMatrix.value.copy(this._groundReflector.matrixWorld);

					} else {

						console.warn("SSREffect: Missing reflectorMatrix uniform or groundReflector.matrixWorld");

					}

					if(uniforms.reflectorNormal) {

						// 确保reflectorNormal.value不为null
						if(uniforms.reflectorNormal.value === null) {

							console.warn("SSREffect: reflectorNormal.value是null，正在创建新向量");
							uniforms.reflectorNormal.value = new Vector3(0, 1, 0);

						} else {

							uniforms.reflectorNormal.value.set(0, 1, 0);

						}

						if(this._groundReflector.matrixWorld) {

							const extractRotationMatrix = new Matrix4().extractRotation(this._groundReflector.matrixWorld);
							uniforms.reflectorNormal.value.applyMatrix4(extractRotationMatrix);

						}

					}

				} catch(error) {

					console.error("Error setting reflector properties:", error);
					uniforms.hasReflector.value = 0;

				}

			} else {

				uniforms.hasReflector.value = 0;

			}

			// Render Screen Space Reflections
			console.log("SSREffect.update: Rendering SSR with scene:", scene);
			this.renderSSR(renderer, inputBuffer);

			// Apply blur if enabled
			if(this._blur && this.blurPass && this.renderTargetSSR && this.renderTargetBlur) {

				try {

					console.log("SSREffect.update: Applying blur effect");

					// 手动设置渲染目标和输入输出
					const currentRT = renderer.getRenderTarget();

					// 使用自定义方式渲染模糊效果
					this.blurPass.render(renderer, this.renderTargetSSR, this.renderTargetBlur);

					// 恢复原始渲染目标
					renderer.setRenderTarget(currentRT);

					// 确保tSSR纹理被正确更新
					if(this.uniforms && this.uniforms.has("tSSR")) {

						console.log("SSREffect.update: Updating tSSR uniform with blurred texture");
						this.uniforms.get("tSSR").value = this.renderTargetBlur.texture;

					}

				} catch(error) {

					console.error("Failed to apply blur effect:", error);
					// 如果模糊处理失败，尝试直接使用未模糊的纹理
					if(this.uniforms && this.uniforms.has("tSSR")) {

						console.log("SSREffect.update: Fallback to non-blurred texture");
						this.uniforms.get("tSSR").value = this.renderTargetSSR.texture;

					}

				}

			} else {

				// 直接使用未模糊的纹理
				if(this.uniforms && this.uniforms.has("tSSR")) {

					console.log("SSREffect.update: Using non-blurred texture (blur disabled)");
					this.uniforms.get("tSSR").value = this.renderTargetSSR.texture;

				}

			}

		} catch(error) {

			console.error("Error in SSREffect update:", error);

		}

	}

	/**
     * Renders Screen Space Reflections.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - The input buffer.
     * @private
     */
	renderSSR(renderer, inputBuffer) {

		console.log("SSREffect: 开始渲染SSR", {
			ssrMaterial: this.ssrMaterial,
			uniforms: this.ssrMaterial ? Object.keys(this.ssrMaterial.uniforms) : null,
			textures: {
				tDiffuse: this.ssrMaterial?.uniforms.tDiffuse?.value,
				tNormal: this.ssrMaterial?.uniforms.tNormal?.value,
				tDepth: this.ssrMaterial?.uniforms.tDepth?.value,
				tMetalness: this.ssrMaterial?.uniforms.tMetalness?.value
			},
			renderTarget: this.renderTargetSSR,
			size: this.renderTargetSSR ? [this.renderTargetSSR.width, this.renderTargetSSR.height] : null,
			inputBuffer: inputBuffer
		});

		// 保存当前渲染器设置
		const previousAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		// 设置SSR着色器
		if(this.ssrMaterial && this.renderTargetSSR) {

			try {

				// 使用漫反射纹理
				this.ssrMaterial.uniforms.tDiffuse.value = inputBuffer.texture;

				// 使用法线纹理
				if(this.normalPass && this.normalPass.texture) {

					this.ssrMaterial.uniforms.tNormal.value = this.normalPass.texture;
					console.log("SSREffect: 使用normalPass.texture");

				} else {

					console.warn("SSREffect: normalPass.texture不可用");

				}

				// 使用深度纹理
				if(this.normalPass && this.normalPass.texture && this.normalPass.texture.depthTexture) {

					this.ssrMaterial.uniforms.tDepth.value = this.normalPass.texture.depthTexture;
					console.log("SSREffect: 使用normalPass.texture.depthTexture");

				} else if(this.renderTargetNormal && this.renderTargetNormal.depthTexture) {

					this.ssrMaterial.uniforms.tDepth.value = this.renderTargetNormal.depthTexture;
					console.log("SSREffect: 使用renderTargetNormal.depthTexture");

				} else {

					console.warn("SSREffect: 没有可用的深度纹理");

				}

				// 使用metalness纹理
				this.ssrMaterial.uniforms.tMetalness.value = this.renderTargetMetalness.texture;

				// 更新相机相关的uniform
				this.ssrMaterial.uniforms.cameraNear.value = this.camera.near;
				this.ssrMaterial.uniforms.cameraFar.value = this.camera.far;

				// 确保投影和视图矩阵是最新的
				if(this.camera.isPerspectiveCamera) {

					this.ssrMaterial.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);
					this.ssrMaterial.uniforms.viewMatrix.value.copy(this.camera.matrixWorldInverse);

				}

				// 设置分辨率
				this.ssrMaterial.uniforms.resolution.value.set(
					this.resolution.x || 1,
					this.resolution.y || 1
				);

				// 执行渲染
				console.log("SSREffect: 渲染到renderTargetSSR");

				// 使用临时场景渲染quad
				if(!this._fullscreenScene) {

					this._fullscreenScene = new Scene();
					this._fullscreenScene.add(this.quad);
					console.log("SSREffect: 创建全屏场景");

				}

				this.quad.material = this.ssrMaterial;
				renderer.setRenderTarget(this.renderTargetSSR);
				// 使用一个临时相机渲染quad
				if(!this._fullscreenCamera) {

					this._fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
					console.log("SSREffect: 创建全屏相机");

				}

				renderer.render(this._fullscreenScene, this._fullscreenCamera);
				console.log("SSREffect: 全屏渲染完成");

				// 重置渲染目标
				renderer.setRenderTarget(null);

			} catch(error) {

				console.error("SSREffect: renderSSR出错", error);

			}

		} else {

			console.error("SSREffect: 无法渲染SSR，材质或渲染目标不可用", {
				ssrMaterial: !!this.ssrMaterial,
				renderTargetSSR: !!this.renderTargetSSR
			});

		}

		// 恢复渲染器设置
		renderer.autoClear = previousAutoClear;

	}

	/**
     * Renders the metalness map.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @private
     */
	renderMetalnessMap(renderer) {

		// 保存原始状态
		const currentRenderTarget = renderer.getRenderTarget();
		const currentAutoClear = renderer.autoClear;
		const currentClearColor = renderer.getClearColor(new Color());
		const currentClearAlpha = renderer.getClearAlpha();

		try {

			// 设置渲染目标和状态
			renderer.setRenderTarget(this.renderTargetMetalness);
			renderer.autoClear = true;
			renderer.setClearColor(0x000000);
			renderer.setClearAlpha(0);
			renderer.clear();

			// 渲染金属度图
			renderer.render(this.scene, this.camera);

		} catch(error) {

			console.error("Error rendering metalness map:", error);

		} finally {

			// 恢复原始状态
			renderer.setRenderTarget(currentRenderTarget);
			renderer.autoClear = currentAutoClear;
			renderer.setClearColor(currentClearColor);
			renderer.setClearAlpha(currentClearAlpha);

		}

	}

	/**
     * Store original materials.
     *
     * @private
     */
	storeOriginalMaterials() {

		const selection = this.selection;
		const originalMaterials = this.originalMaterials;

		for(const object of selection) {

			if(!originalMaterials.has(object)) {

				originalMaterials.set(object, object.material);

			}

		}

	}

	/**
     * Set selection to reflective material.
     *
     * @private
     */
	setSelectionToReflectiveMaterial() {

		const metalnessOnMaterial = this.metalnessOnMaterial;
		const selection = this.selection;

		for(const object of selection) {

			object.material = metalnessOnMaterial;

		}

	}

	/**
     * Restore original materials.
     *
     * @private
     */
	restoreOriginalMaterials() {

		const selection = this.selection;
		const originalMaterials = this.originalMaterials;

		for(const object of selection) {

			if(originalMaterials.has(object)) {

				object.material = originalMaterials.get(object);

			}

		}

	}

	/**
     * Sets the resolution.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
	setSize(width, height) {

		try {

			console.log("SSREffect.setSize:", width, height);

			// 确保宽高至少为1
			width = Math.max(1, width);
			height = Math.max(1, height);

			// Scale the resolution
			const resolution = this.resolution;
			resolution.set(width, height).multiplyScalar(this._resolutionScale || 0.5);

			// 确保分辨率至少为1x1
			resolution.x = Math.max(1, resolution.x);
			resolution.y = Math.max(1, resolution.y);

			console.log("SSREffect: 调整大小为", resolution.x, resolution.y);

			// Update render targets
			if(this.renderTargetNormal) {

				this.renderTargetNormal.setSize(resolution.x, resolution.y);

			}

			if(this.renderTargetBeauty) {

				this.renderTargetBeauty.setSize(resolution.x, resolution.y);

			}

			if(this.renderTargetMetalness) {

				this.renderTargetMetalness.setSize(resolution.x, resolution.y);

			}

			if(this.renderTargetSSR) {

				this.renderTargetSSR.setSize(resolution.x, resolution.y);

			}

			// Update blur pass and targets if enabled
			if(this._blur) {

				if(this.blurPass) {

					this.blurPass.setSize(resolution.x, resolution.y);

				}

				if(this.renderTargetBlur) {

					this.renderTargetBlur.setSize(resolution.x, resolution.y);

				}

			}

			// Update normal pass
			if(this.normalPass) {

				this.normalPass.setSize(resolution.x, resolution.y);

			} else {

				console.warn("SSREffect.setSize: normalPass不存在");

			}

			// Update SSR material uniforms
			if(this.ssrMaterial && this.ssrMaterial.uniforms) {

				if(this.ssrMaterial.uniforms.resolution) {

					this.ssrMaterial.uniforms.resolution.value.set(resolution.x, resolution.y);

				}

				// 更新其他可能依赖分辨率的参数
				console.log("SSREffect: 更新材质分辨率为", resolution.x, resolution.y);

			}

		} catch(error) {

			console.error("SSREffect.setSize错误:", error);

		}

	}

	/**
     * Disposes the effect.
     */
	dispose() {

		// Dispose render targets
		this.renderTargetNormal.dispose();
		this.renderTargetBeauty.dispose();
		this.renderTargetMetalness.dispose();
		this.renderTargetSSR.dispose();

		if(this._blur) {

			this.renderTargetBlur.dispose();
			this.blurPass.dispose();

		}

		// Dispose passes
		this.normalPass.dispose();
		this.ssrPass.dispose();

		// Dispose materials
		this.ssrMaterial.dispose();
		this.metalnessOnMaterial.dispose();
		this.metalnessOffMaterial.dispose();

		super.dispose();

	}

	// -----------------
	// GETTERS/SETTERS
	// -----------------

	/**
     * The thickness of the reflections.
     *
     * @type {Number}
     */
	get thickness() {

		return this._thickness;

	}

	set thickness(value) {

		this._thickness = value;
		this.ssrMaterial.uniforms.thickness.value = value;
		this.ssrMaterial.defines.THICKNESS = value.toFixed(6);
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * The maximum reflection distance.
     *
     * @type {Number}
     */
	get maxDistance() {

		return this._maxDistance;

	}

	set maxDistance(value) {

		this._maxDistance = value;
		this.ssrMaterial.uniforms.maxDistance.value = value;
		this.ssrMaterial.defines.MAX_DISTANCE = value.toFixed(6);
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * The opacity of the reflections.
     *
     * @type {Number}
     */
	get opacity() {

		return this._opacity;

	}

	set opacity(value) {

		this._opacity = value;
		this.ssrMaterial.uniforms.opacity.value = value;
		this.uniforms.get("opacity").value = value;

	}

	/**
     * Whether to use the fresnel effect.
     *
     * @type {Boolean}
     */
	get fresnel() {

		return this._fresnel;

	}

	set fresnel(value) {

		this._fresnel = value;
		this.ssrMaterial.defines.FRESNEL = value ? 1 : 0;
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * Whether to use distance attenuation.
     *
     * @type {Boolean}
     */
	get distanceAttenuation() {

		return this._distanceAttenuation;

	}

	set distanceAttenuation(value) {

		this._distanceAttenuation = value;
		this.ssrMaterial.defines.DISTANCE_ATTENUATION = value ? 1 : 0;
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * Whether the reflection can bounce on surfaces.
     *
     * @type {Boolean}
     */
	get bouncing() {

		return this._bouncing;

	}

	set bouncing(value) {

		this._bouncing = value;
		this.ssrMaterial.defines.BOUNCING = value ? 1 : 0;
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * Whether to use infinite thickness.
     *
     * @type {Boolean}
     */
	get infiniteThick() {

		return this._infiniteThick;

	}

	set infiniteThick(value) {

		this._infiniteThick = value;
		this.ssrMaterial.defines.INFINITE_THICK = value ? 1 : 0;
		this.ssrMaterial.needsUpdate = true;

	}

	/**
     * Whether to blur the reflections.
     *
     * @type {Boolean}
     */
	get blur() {

		return this._blur;

	}

	set blur(value) {

		if(this._blur !== value) {

			this._blur = value;

			if(this.blurPass) {

				try {

					this.blurPass.enabled = value;

					// 更新uniform引用
					if(this.uniforms && this.uniforms.has("tSSR")) {

						this.uniforms.get("tSSR").value = value && this.renderTargetBlur ?
							this.renderTargetBlur.texture :
							this.renderTargetSSR.texture;

					}

				} catch(error) {

					console.error("Error updating blur state:", error);

				}

			}

		}

	}

	/**
     * Gets the ground reflector.
     *
     * @return {ReflectorForSSRPass} The ground reflector.
     */
	get groundReflector() {

		return this._groundReflector;

	}

	/**
     * Sets the ground reflector.
     *
     * @param {ReflectorForSSRPass} value - The ground reflector.
     */
	set groundReflector(value) {

		// 验证value是否有效
		if(value !== null && value !== undefined) {

			if(!value.matrixWorld) {

				console.warn("SSREffect: groundReflector没有matrixWorld属性");

			}

		}
		this._groundReflector = value;

	}

	/**
     * 渲染分辨率缩放因子。
     *
     * @type {Number}
     */
	get resolutionScale() {

		return this._resolutionScale;

	}

	set resolutionScale(value) {

		if(this._resolutionScale !== value) {

			this._resolutionScale = value;

			// 如果已经初始化，立即应用新的分辨率
			if(this.resolution) {

				const width = this.resolution.x / (this._resolutionScale || 0.5);
				const height = this.resolution.y / (this._resolutionScale || 0.5);
				this.setSize(width, height);

			}

		}

	}

}
