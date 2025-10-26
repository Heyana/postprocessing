import {
	AddEquation,
	Color,
	NormalBlending,
	DepthTexture,
	SrcAlphaFactor,
	OneMinusSrcAlphaFactor,
	MeshNormalMaterial,
	MeshBasicMaterial,
	NearestFilter,
	NoBlending,
	ShaderMaterial,
	UniformsUtils,
	UnsignedShortType,
	WebGLRenderTarget,
	LinearFilter,
	HalfFloatType,
	RGBADepthPacking,
	BasicDepthPacking,
	EqualDepth,
	NotEqualDepth,
	Layers,
	Uniform
} from "three";
import { Pass, FullScreenQuad } from "./Pass.js";
import { SSRShader, SSRBlurShader, SSRDepthShader } from "../shaders/SelectiveSSRShader.js";
import { CopyShader } from "../shaders/CopyShader.js";
// 导入Selection类，用于管理选中对象
import { Selection } from "postprocessing";
// 导入DepthMaskMaterial和DepthPass
import { DepthMaskMaterial, DepthPass, ShaderPass } from "postprocessing";
// 导入深度测试策略
import { renderUtils } from "../../../utils/RenderUtils.js";
import { DepthTestStrategy } from "postprocessing";
class SelectiveSSRPass extends Pass {

	constructor({ renderer, scene, camera, width, height, selection, bouncing = false, groundReflector, composer, gBufferTextures = null }) {

		super();

		this.width = (width !== undefined) ? width : 512;
		this.height = (height !== undefined) ? height : 512;

		// G-Buffer支持
		this.gBufferTextures = gBufferTextures;
		this.usingGBuffer = !!(gBufferTextures && gBufferTextures.gNormal && gBufferTextures.gDepth);

		console.log('Log-- ', gBufferTextures, 'gBufferTextures');
		this.clear = true;

		this.renderer = renderer;
		this.scene = scene;
		this.camera = camera;
		this.composer = composer;
		this.groundReflector = groundReflector;

		this.opacity = SSRShader.uniforms.opacity.value;
		this.output = 0;

		this.maxDistance = SSRShader.uniforms.maxDistance.value;
		this.thickness = SSRShader.uniforms.thickness.value;
		this.reflectionStrength = SSRShader.uniforms.reflectionStrength.value;

		this.tempColor = new Color();

		// 添加外部深度纹理支持
		this.externalDepthTexture = null;
		this.useExternalDepth = false;

		// 替换selects为selection
		this._selection = selection || new Selection();
		this.selective = true; // 始终启用选择性


		this._bouncing = bouncing;
		Object.defineProperty(this, "bouncing", {
			get() {

				return this._bouncing;

			},
			set(val) {


				this.setBouncing(val);

			}
		});

		this.blur = true;

		this._distanceAttenuation = SSRShader.defines.DISTANCE_ATTENUATION;
		Object.defineProperty(this, "distanceAttenuation", {
			get() {

				return this._distanceAttenuation;

			},
			set(val) {

				if (this._distanceAttenuation === val) { return; }
				this._distanceAttenuation = val;
				this.ssrMaterial.defines.DISTANCE_ATTENUATION = val;
				this.ssrMaterial.needsUpdate = true;

			}
		});


		this._fresnel = SSRShader.defines.FRESNEL;
		Object.defineProperty(this, "fresnel", {
			get() {

				return this._fresnel;

			},
			set(val) {

				if (this._fresnel === val) { return; }
				this._fresnel = val;
				this.ssrMaterial.defines.FRESNEL = val;
				this.ssrMaterial.needsUpdate = true;

			}
		});

		this._infiniteThick = SSRShader.defines.INFINITE_THICK;
		Object.defineProperty(this, "infiniteThick", {
			get() {

				return this._infiniteThick;

			},
			set(val) {

				if (this._infiniteThick === val) { return; }
				this._infiniteThick = val;
				this.ssrMaterial.defines.INFINITE_THICK = val;
				this.ssrMaterial.needsUpdate = true;

			}
		});

		// 反射强度属性
		this._reflectionStrength = SSRShader.uniforms.reflectionStrength.value;
		Object.defineProperty(this, "reflectionStrength", {
			get() {

				return this._reflectionStrength;

			},
			set(val) {

				if (this._reflectionStrength === val) { return; }
				this._reflectionStrength = val;
				if (this.ssrMaterial) {

					this.ssrMaterial.uniforms.reflectionStrength.value = val;

				}

			}
		});

		// beauty render target with depth buffer

		const depthTexture = new DepthTexture();
		depthTexture.type = UnsignedShortType;
		depthTexture.minFilter = LinearFilter;
		depthTexture.magFilter = LinearFilter;

		this.beautyRenderTarget = new WebGLRenderTarget(this.width, this.height, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
			depthTexture: depthTexture,
			depthBuffer: true
		});

		// for bouncing
		this.prevRenderTarget = new WebGLRenderTarget(this.width, this.height, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
		});

		// normal render target (only create if not using G-Buffer)
		if (!this.usingGBuffer) {
			this.normalRenderTarget = new WebGLRenderTarget(this.width, this.height, {
				minFilter: LinearFilter,
				magFilter: LinearFilter,
				type: HalfFloatType,
			});
		} else {
			this.normalRenderTarget = null;
		}

		// metalness render target

		this.metalnessRenderTarget = new WebGLRenderTarget(this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			type: HalfFloatType
		});


		// ssr render target

		this.ssrRenderTarget = new WebGLRenderTarget(this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter
		});

		this.blurRenderTarget = this.ssrRenderTarget.clone();
		this.blurRenderTarget2 = this.ssrRenderTarget.clone();
		// this.blurRenderTarget3 = this.ssrRenderTarget.clone();

		// ssr material

		this.ssrMaterial = new ShaderMaterial({
			defines: Object.assign({}, SSRShader.defines, {
				MAX_STEP: Math.sqrt(this.width * this.width + this.height * this.height)
			}),
			uniforms: UniformsUtils.clone(SSRShader.uniforms),
			vertexShader: SSRShader.vertexShader,
			fragmentShader: SSRShader.fragmentShader,
			blending: NoBlending
		});

		if (!composer.depthTexture) { composer.createDepthTexture(); }
		this.ssrMaterial.uniforms.depthTexture = new Uniform(composer.depthTexture);
		console.log("Log-- ", composer.depthTexture, "composer.depthTexture");
		// this.uniforms.get("depthTexture").value = composer.depthTexture;

		// Use G-Buffer beauty or fallback to rendered beauty
		// if (this.usingGBuffer && this.gBufferTextures.gColor) {
		// 	this.ssrMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gColor;
		// 	console.log("✅ SSR: 使用G-Buffer颜色数据");
		// } else {
		this.ssrMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
		console.log("⚠️ SSR: 使用传统Beauty渲染");
		// }

		// Use G-Buffer normal or fallback to rendered normal
		if (this.usingGBuffer) {
			this.ssrMaterial.uniforms.tNormal.value = this.gBufferTextures.gNormal;
			console.log("✅ SSR: 使用G-Buffer法线数据");
		} else {
			this.ssrMaterial.uniforms.tNormal.value = this.normalRenderTarget?.texture;
			console.log("⚠️ SSR: 使用传统法线渲染");
		}

		this.ssrMaterial.defines.SELECTIVE = this.selective;
		this.ssrMaterial.needsUpdate = true;
		this.ssrMaterial.uniforms.tMetalness.value = this.metalnessRenderTarget.texture;

		// Use G-Buffer depth or fallback to beauty depth
		if (this.usingGBuffer && this.gBufferTextures.gDepth) {
			this.ssrMaterial.uniforms.tDepth.value = this.gBufferTextures.gDepth;
			console.log("✅ SSR: 使用G-Buffer深度数据");
		} else {
			this.ssrMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;
			console.log("⚠️ SSR: 使用传统深度渲染");
		}
		this.ssrMaterial.uniforms.cameraNear.value = this.camera.near;
		this.ssrMaterial.uniforms.cameraFar.value = this.camera.far;
		this.ssrMaterial.uniforms.thickness.value = this.thickness;
		this.ssrMaterial.uniforms.resolution.value.set(this.width, this.height);
		this.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
		this.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
		this.ssrMaterial.uniforms.reflectionStrength.value = this.reflectionStrength;


		// 创建遮罩渲染目标
		this.renderTargetMask = new WebGLRenderTarget(this.width, this.height, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
			depthBuffer: true
		});
		this.renderTargetMask.texture.name = "SSR.Mask";

		// 创建深度通道
		this.depthPass = new DepthPass(scene, camera);

		// 创建深度遮罩材质
		this.depthMaskMaterial = new DepthMaskMaterial();
		this.depthMaskMaterial.copyCameraSettings(camera);
		this.depthMaskMaterial.depthBuffer0 = composer.depthTexture; // 场景深度
		this.depthMaskMaterial.depthPacking0 = BasicDepthPacking; // BasicDepthPacking
		this.depthMaskMaterial.depthBuffer1 = this.depthPass.texture; // 选中对象深度
		this.depthMaskMaterial.depthPacking1 = RGBADepthPacking; // RGBADepthPacking
		this.depthMaskMaterial.depthMode = EqualDepth; // 默认使用相等深度模式
		this.depthMaskMaterial.epsilon = 0.000009; // 深度比较容差

		// 使用深度遮罩材质创建遮罩通道
		this.maskPass = new ShaderPass(this.depthMaskMaterial);
		this.maskPass.clear = true; // 确保渲染之前清理目标

		// 反转遮罩和忽略背景选项
		this._inverted = false;
		this._ignoreBackground = false;

		// normal material

		this.normalMaterial = new MeshNormalMaterial();
		this.normalMaterial.blending = NoBlending;

		// metalnessOn material

		this.metalnessOnMaterial = new MeshBasicMaterial({
			color: "white"
		});

		// metalnessOff material

		this.metalnessOffMaterial = new MeshBasicMaterial({
			color: "black"
		});

		// blur material

		this.blurMaterial = new ShaderMaterial({
			defines: Object.assign({}, SSRBlurShader.defines),
			uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
			vertexShader: SSRBlurShader.vertexShader,
			fragmentShader: SSRBlurShader.fragmentShader
		});
		this.blurMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture;
		this.blurMaterial.uniforms.resolution.value.set(this.width, this.height);

		// blur material 2

		this.blurMaterial2 = new ShaderMaterial({
			defines: Object.assign({}, SSRBlurShader.defines),
			uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
			vertexShader: SSRBlurShader.vertexShader,
			fragmentShader: SSRBlurShader.fragmentShader
		});
		this.blurMaterial2.uniforms.tDiffuse.value = this.blurRenderTarget.texture;
		this.blurMaterial2.uniforms.resolution.value.set(this.width, this.height);

		// // blur material 3

		// this.blurMaterial3 = new ShaderMaterial({
		//   defines: Object.assign({}, SSRBlurShader.defines),
		//   uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
		//   vertexShader: SSRBlurShader.vertexShader,
		//   fragmentShader: SSRBlurShader.fragmentShader
		// });
		// this.blurMaterial3.uniforms['tDiffuse'].value = this.blurRenderTarget2.texture;
		// this.blurMaterial3.uniforms['resolution'].value.set(this.width, this.height);

		// material for rendering the depth

		this.depthRenderMaterial = new ShaderMaterial({
			defines: Object.assign({}, SSRDepthShader.defines),
			uniforms: UniformsUtils.clone(SSRDepthShader.uniforms),
			vertexShader: SSRDepthShader.vertexShader,
			fragmentShader: SSRDepthShader.fragmentShader,
			blending: NoBlending
		});
		this.depthRenderMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;
		this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near;
		this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far;

		// material for rendering the content of a render target

		this.copyMaterial = new ShaderMaterial({
			uniforms: UniformsUtils.clone(CopyShader.uniforms),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blendSrc: SrcAlphaFactor,
			blendDst: OneMinusSrcAlphaFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: SrcAlphaFactor,
			blendDstAlpha: OneMinusSrcAlphaFactor,
			blendEquationAlpha: AddEquation
			// premultipliedAlpha:true,
		});

		this.fsQuad = new FullScreenQuad(null);

		this.originalClearColor = new Color();

	}

	dispose() {

		// dispose render targets

		this.beautyRenderTarget.dispose();
		this.prevRenderTarget.dispose();
		this.normalRenderTarget.dispose();
		this.metalnessRenderTarget.dispose();
		this.ssrRenderTarget.dispose();
		this.blurRenderTarget.dispose();
		this.blurRenderTarget2.dispose();
		// this.blurRenderTarget3.dispose();

		// dispose materials

		this.normalMaterial.dispose();
		this.metalnessOnMaterial.dispose();
		this.metalnessOffMaterial.dispose();
		this.blurMaterial.dispose();
		this.blurMaterial2.dispose();
		this.copyMaterial.dispose();
		this.depthRenderMaterial.dispose();

		// dipsose full screen quad

		this.fsQuad.dispose();

	}

	renderOpts = {
		projectObject: true, // 控制是否执行对象投影
		updateMatrixWorld: false,
		useProgramCache: false // 控制是否使用着色器缓存和快速路径
	};

	render(renderer, writeBuffer, inputBuffer, deltaTime, stencilTest, depthPass, effectPassOpts) {

		// this.depthMaskMaterial.copyCameraSettings(this.camera);
		const oldMatrixAutoUpdate = this.scene.matrixAutoUpdate;
		const oldCameraMatrixAutoUpdate = this.camera.matrixAutoUpdate;
		const oldShadowUpdate = renderer.shadowMap.needsUpdate;
		this.scene.matrixAutoUpdate = false;
		this.camera.matrixAutoUpdate = false;
		renderer.shadowMap.needsUpdate = false;
		// this.ssrMaterial.uniforms['tNormal'].value = this.composer.normalTarget.texture
		// 保存当前渲染器设置
		this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
		const currentRenderTarget = renderer.getRenderTarget();

		// 保存场景背景
		const background = this.scene.background;

		// 在G-Buffer模式下跳过beauty渲染（由RenderPass提供）
		// if (!this.usingGBuffer) {
		// 渲染beauty和depth
		renderer.setRenderTarget(this.beautyRenderTarget);
		renderer.clear();
		if (this.groundReflector) {
			this.groundReflector.visible = false;
			this.groundReflector.doRender(this.renderer, this.scene, this.camera);
			this.groundReflector.visible = true;
		}
		// console.log("⚠️ SSR: 渲染传统Beauty缓冲区");
		// } else {
		// console.log("✅ SSR: 跳过Beauty渲染，使用G-Buffer颜色数据");
		// }

		// 暂时移除背景以避免与反射混淆
		this.scene.background = null;

		if (this.groundReflector) { this.groundReflector.visible = false; }

		// 渲染normals (only if not using G-Buffer)
		if (!this.usingGBuffer) {
			this.renderOverride(
				renderer,
				this.normalMaterial,
				this.normalRenderTarget,
				0,
				0,
				effectPassOpts);
			console.log("⚠️ SSR: 渲染传统法线纹理");
		} else {
			// console.log("✅ SSR: 跳过法线渲染，使用G-Buffer法线数据");
		}
		// } else {
		// 	console.log("🎯 SSR: 使用G-Buffer模式，跳过beauty和normals渲染");
		// }
		this.depthMaskMaterial.depthBuffer0 = this.composer.depthTexture;
		this.depthMaskMaterial.inputBuffer = inputBuffer.texture;

		// 保存相机当前层掩码
		const mask = this.camera.layers.mask;

		// 1. 设置相机仅渲染选中的层
		this.camera.layers.set(this._selection.layer);

		// 2. 处理选中对象的子元素，将它们也设置为选中层
		const otherModels = [];
		this._selection.forEach((model) => {

			if (model.children.length > 0) {

				model.traverse((child) => {

					if (child.isMesh && !child.layers.isEnabled(this._selection.layer) && child.visible) {

						otherModels.push({
							model: child,
							oldLayerMask: child.layers.mask // 保存原始的完整层掩码
						});
						child.layers.set(this._selection.layer); // 设置为selection.layer

					}

				});

			}

		});

		// 3. 渲染选中对象的深度
		this.depthPass.render(renderer, inputBuffer, undefined, undefined, undefined, undefined, {
			...renderUtils.opts.getDepthParamsOpts()
		});

		this.ssrMaterial.uniforms.depthPass1 = new Uniform(this.depthPass.renderTarget.texture);

		// 4. 恢复相机原始层掩码
		this.camera.layers.mask = mask;

		// 5. 恢复子对象的原始层设置
		otherModels.forEach(({ model, oldLayerMask }) => {

			model.layers.mask = oldLayerMask; // 直接恢复整个掩码

		});

		// 更新深度掩码材质，使用beautyRenderTarget的深度作为比较

		// 明确清理遮罩渲染目标
		renderer.setRenderTarget(this.renderTargetMask);
		renderer.clear(true, true, true);

		// 使用深度遮罩材质渲染遮罩
		this.maskPass.render(renderer, inputBuffer, this.renderTargetMask, undefined, undefined, {
			projectObject: true,
			updateMatrixWorld: false,
			useProgramCache: false,
			...renderUtils.getSubOpths(false)
		});

		// 恢复场景背景
		this.scene.background = background;


		this.ssrMaterial.uniforms.maskTexture = {
			value: this.renderTargetMask.texture
		};
		// 渲染metalnesses（如果需要）
		// if (this.selective) {
		//     this.renderMetalness(renderer, this.metalnessOnMaterial, this.metalnessRenderTarget, 0, 0);
		// }

		// 渲染SSR
		this.ssrMaterial.uniforms.opacity.value = this.opacity;
		this.ssrMaterial.uniforms.maxDistance.value = this.maxDistance;
		this.ssrMaterial.uniforms.thickness.value = this.thickness;
		this.ssrMaterial.uniforms.reflectionStrength.value = this.reflectionStrength;
		this.ssrMaterial.uniforms.maskTexture = { value: this.renderTargetMask.texture };
		this.ssrMaterial.uniforms.maskThreshold = { value: this.maskThreshold };
		this.ssrMaterial.defines.SELECTIVE = true;
		this.ssrMaterial.needsUpdate = true;

		// 如果使用外部深度纹理，则需要确保更新SSR材质
		if (this.useExternalDepth && this.externalDepthTexture) {

			this.ssrMaterial.uniforms.tDepth.value = this.externalDepthTexture;

		} else {

			this.ssrMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;

		}

		this.renderPass(renderer, this.ssrMaterial, this.ssrRenderTarget);

		// 渲染blur
		if (this.blur) {

			this.renderPass(renderer, this.blurMaterial, this.blurRenderTarget);
			this.renderPass(renderer, this.blurMaterial2, this.blurRenderTarget2);

		}

		// 输出结果到屏幕
		switch (this.output) {

			case SelectiveSSRPass.OUTPUT.Default:
				if (this.bouncing) {

					this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

					if (this.blur) { this.copyMaterial.uniforms.tDiffuse.value = this.blurRenderTarget2.texture; } else { this.copyMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture; }
					this.copyMaterial.blending = NormalBlending;
					this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

					this.copyMaterial.uniforms.tDiffuse.value = this.prevRenderTarget.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

				} else {

					this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

					if (this.blur) { this.copyMaterial.uniforms.tDiffuse.value = this.blurRenderTarget2.texture; } else { this.copyMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture; }
					this.copyMaterial.blending = NormalBlending;
					this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

				}
				break;

			case SelectiveSSRPass.OUTPUT.SSR:
				if (this.blur) { this.copyMaterial.uniforms.tDiffuse.value = this.blurRenderTarget2.texture; } else { this.copyMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture; }
				this.copyMaterial.blending = NoBlending;
				this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

				if (this.bouncing) {

					if (this.blur) { this.copyMaterial.uniforms.tDiffuse.value = this.blurRenderTarget2.texture; } else { this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture; }
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

					this.copyMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture;
					this.copyMaterial.blending = NormalBlending;
					this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

				}
				break;

			case SelectiveSSRPass.OUTPUT.Beauty:
				this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
				break;

			case SelectiveSSRPass.OUTPUT.Depth:
				if (this.usingGBuffer) {
					// 创建G-Buffer深度可视化材质（如果不存在）
					if (!this.gBufferDepthMaterial) {
						this.gBufferDepthMaterial = new ShaderMaterial({
							uniforms: {
								tDepth: { value: null },
								cameraNear: { value: this.camera.near },
								cameraFar: { value: this.camera.far }
							},
							vertexShader: /* glsl */`
								varying vec2 vUv;
								void main() {
									vUv = uv;
									gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
								}
							`,
							fragmentShader: /* glsl */`
								uniform sampler2D tDepth;
								uniform float cameraNear;
								uniform float cameraFar;
								varying vec2 vUv;
								
								void main() {
									// 读取G-Buffer深度值（已经是归一化的线性深度）
									float depth = texture2D(tDepth, vUv).r;
									
									// 增强对比度以便更好地可视化
									depth = pow(depth, 0.5);
									
									gl_FragColor = vec4(vec3(depth), 1.0);
								}
							`,
							depthTest: false,
							depthWrite: false
						});
					}

					// 使用G-Buffer深度纹理
					this.gBufferDepthMaterial.uniforms.tDepth.value = this.gBufferTextures.gDepth;
					this.gBufferDepthMaterial.uniforms.cameraNear.value = this.camera.near;
					this.gBufferDepthMaterial.uniforms.cameraFar.value = this.camera.far;
					this.renderPass(renderer, this.gBufferDepthMaterial, this.renderToScreen ? null : writeBuffer);
				} else {
					// 使用传统深度纹理
					this.depthRenderMaterial.uniforms.tDepth.value = this.composer.depthTexture;
					this.renderPass(renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer);
				}
				break;

			case SelectiveSSRPass.OUTPUT.Normal:
				// console.log('Log-- ', this.gBufferTextures, 'this.gBufferTextures');

				if (this.usingGBuffer) {
					this.copyMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gNormal;
				} else {
					this.copyMaterial.uniforms.tDiffuse.value = this.normalRenderTarget.texture;
				}
				this.copyMaterial.blending = NoBlending;
				this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
				break;

			case SelectiveSSRPass.OUTPUT.Metalness:
				this.copyMaterial.uniforms.tDiffuse.value = this.metalnessRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
				break;

			case SelectiveSSRPass.OUTPUT.Mask:
				this.copyMaterial.uniforms.tDiffuse.value = this.depthPass.renderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
				break;

			case SelectiveSSRPass.OUTPUT.Debug:
				// 直接使用SSR材质渲染，便于调试着色器
				// 不使用blur，直接显示ssrMaterial的结果
				this.renderPass(renderer, this.ssrMaterial, this.renderToScreen ? null : writeBuffer);
				break;

			case SelectiveSSRPass.OUTPUT.GBufferColor:
				if (this.usingGBuffer && this.gBufferTextures && this.gBufferTextures.gColor) {
					this.copyMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gColor;
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
					console.log("🎨 显示G-Buffer颜色通道");
				} else {
					console.warn("⚠️ G-Buffer颜色纹理不可用");
					// 回退到Beauty模式
					this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
				}
				break;

			case SelectiveSSRPass.OUTPUT.GBufferPosition:
				if (this.usingGBuffer && this.gBufferTextures && this.gBufferTextures.gPosition) {
					// 创建位置可视化材质（如果不存在）
					if (!this.gBufferPositionMaterial) {
						this.gBufferPositionMaterial = new ShaderMaterial({
							uniforms: {
								tDiffuse: { value: null },
								cameraNear: { value: 0.1 },
								cameraFar: { value: 1000 }
							},
							vertexShader: /* glsl */`
								varying vec2 vUv;
								void main() {
									vUv = uv;
									gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
								}
							`,
							fragmentShader: /* glsl */`
								uniform sampler2D tDiffuse;
								uniform float cameraNear;
								uniform float cameraFar;
								varying vec2 vUv;
								
								void main() {
									vec4 positionData = texture2D(tDiffuse, vUv);
									vec3 viewPosition = positionData.xyz;
									
									// 将视图空间位置转换为可视化的颜色
									// 使用距离来着色
									float distance = length(viewPosition);
									float normalizedDistance = (distance - cameraNear) / (cameraFar - cameraNear);
									normalizedDistance = clamp(normalizedDistance, 0.0, 1.0);
									
									// 创建彩色可视化
									vec3 color = vec3(
										normalizedDistance,
										1.0 - normalizedDistance,
										0.5
									);
									
									gl_FragColor = vec4(color, 1.0);
								}
							`
						});
					}

					this.gBufferPositionMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gPosition;
					this.gBufferPositionMaterial.uniforms.cameraNear.value = this.camera.near;
					this.gBufferPositionMaterial.uniforms.cameraFar.value = this.camera.far;
					this.renderPass(renderer, this.gBufferPositionMaterial, this.renderToScreen ? null : writeBuffer);
					console.log("📍 显示G-Buffer位置通道");
				} else {
					console.warn("⚠️ G-Buffer位置纹理不可用");
					// 回退到Depth模式
					if (this.usingGBuffer && this.gBufferTextures && this.gBufferTextures.gDepth) {
						if (!this.gBufferDepthMaterial) {
							this.gBufferDepthMaterial = new ShaderMaterial({
								uniforms: { tDiffuse: { value: null } },
								vertexShader: `
									varying vec2 vUv;
									void main() {
										vUv = uv;
										gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
									}
								`,
								fragmentShader: `
									uniform sampler2D tDiffuse;
									varying vec2 vUv;
									void main() {
										float depth = texture2D(tDiffuse, vUv).r;
										gl_FragColor = vec4(depth, depth, depth, 1.0);
									}
								`
							});
						}
						this.gBufferDepthMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gDepth;
						this.renderPass(renderer, this.gBufferDepthMaterial, this.renderToScreen ? null : writeBuffer);
					}
				}
				break;

			default:
				console.warn("THREE.SSRPass: Unknown output type.");

		}

		// 恢复原始渲染目标
		renderer.setRenderTarget(this.ssrRenderTarget);
		this.scene.matrixAutoUpdate = oldMatrixAutoUpdate;
		this.camera.matrixAutoUpdate = oldCameraMatrixAutoUpdate;
		renderer.shadowMap.needsUpdate = oldShadowUpdate;

	}

	renderPass(renderer, passMaterial, renderTarget, clearColor, clearAlpha) {

		// save original state
		this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
		const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget(renderTarget);

		// setup pass state
		renderer.autoClear = false;
		if ((clearColor !== undefined) && (clearColor !== null)) {

			renderer.setClearColor(clearColor);
			renderer.setClearAlpha(clearAlpha || 0.0);
			renderer.clear();

		}

		this.fsQuad.material = passMaterial;
		this.fsQuad.render(renderer, {
			projectObject: true,
			updateMatrixWorld: false,
			useProgramCache: false
		});

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor(this.originalClearColor);
		renderer.setClearAlpha(originalClearAlpha);

	}

	renderOverride(
		renderer,
		overrideMaterial,
		renderTarget,
		clearColor,
		clearAlpha,
		effectPassOpts) {

		this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
		const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget(renderTarget);
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ((clearColor !== undefined) && (clearColor !== null)) {

			renderer.setClearColor(clearColor);
			renderer.setClearAlpha(clearAlpha || 0.0);
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.shadowMap.autoUpdate = false;
		renderer.render(this.scene, this.camera,
			renderUtils.getStandardOpts(
				{
					projectObject: true,
					updateMatrixWorld: false,
					useProgramCache: false
				}, {
				subOptsState: false
			}
			));
		this.scene.overrideMaterial = null;

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor(this.originalClearColor);
		renderer.setClearAlpha(originalClearAlpha);

	}

	renderMetalness(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {

		this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
		const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget(renderTarget);
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ((clearColor !== undefined) && (clearColor !== null)) {

			renderer.setClearColor(clearColor);
			renderer.setClearAlpha(clearAlpha || 0.0);
			renderer.clear();

		}

		// 使用Selection对象获取选中的对象
		const selectedObjects = Array.from(this._selection);

		this.scene.traverseVisible(child => {

			child._SSRPassBackupMaterial = child.material;
			if (selectedObjects.includes(child)) {

				child.material = this.metalnessOnMaterial;

			} else {

				child.material = this.metalnessOffMaterial;

			}

		});
		renderer.shadowMap.autoUpdate = false;

		const oldUpdate = this.scene.matrixWorldAutoUpdate;
		this.scene.matrixWorldAutoUpdate = false;
		renderer.render(this.scene, this.camera);
		this.scene.matrixWorldAutoUpdate = oldUpdate;
		this.scene.traverseVisible(child => {

			child.material = child._SSRPassBackupMaterial;

		});

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor(this.originalClearColor);
		renderer.setClearAlpha(originalClearAlpha);

	}

	setSize(width, height) {

		this.width = width;
		this.height = height;

		this.ssrMaterial.defines.MAX_STEP = Math.sqrt(width * width + height * height);
		this.ssrMaterial.needsUpdate = true;
		this.beautyRenderTarget.setSize(width, height);
		this.prevRenderTarget.setSize(width, height);
		this.ssrRenderTarget.setSize(width, height);

		// 只在非G-Buffer模式下更新normalRenderTarget
		if (this.normalRenderTarget) {
			this.normalRenderTarget.setSize(width, height);
		}

		this.metalnessRenderTarget.setSize(width, height);
		this.blurRenderTarget.setSize(width, height);
		this.blurRenderTarget2.setSize(width, height);

		// 更新新添加的渲染目标尺寸
		if (this.renderTargetMask) {

			this.renderTargetMask.setSize(width, height);

		}

		// 更新深度通道尺寸
		if (this.depthPass) {

			this.depthPass.setSize(width, height);

		}

		// 更新遮罩通道尺寸
		if (this.maskPass) {

			this.maskPass.setSize(width, height);

		}

		this.ssrMaterial.uniforms.resolution.value.set(width, height);
		this.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
		this.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);

		this.blurMaterial.uniforms.resolution.value.set(width, height);
		this.blurMaterial2.uniforms.resolution.value.set(width, height);

		console.log("Log-- ", width, height, "width,height,ssrpass");

	}

	/**
	 * 设置外部深度纹理
	 * @param {DepthTexture} depthTexture - 外部深度纹理
	 * @param {number} depthPacking - 深度打包格式 (e.g., BasicDepthPacking)
	 */
	setDepthTexture(depthTexture, depthPacking) {

		if (depthTexture) {

			this.externalDepthTexture = depthTexture;
			this.useExternalDepth = true;

			// 更新SSR材质的深度纹理
			if (this.ssrMaterial) {

				this.ssrMaterial.uniforms.tDepth.value = depthTexture;

			}

			// 更新深度渲染材质的深度纹理
			if (this.depthRenderMaterial) {

				this.depthRenderMaterial.uniforms.tDepth.value = depthTexture;

			}

			console.log("SSRPass: 使用外部深度纹理");

		} else {

			this.useExternalDepth = false;

			// 恢复为内部深度纹理
			if (this.ssrMaterial && this.beautyRenderTarget) {

				this.ssrMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;

			}

			// 恢复深度渲染材质的深度纹理
			if (this.depthRenderMaterial && this.beautyRenderTarget) {

				this.depthRenderMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;

			}

			console.log("SSRPass: 恢复使用内部深度纹理");

		}

	}

	/**
	 * 刷新反射效果，适用于修改selects后需要重新计算反射的情况
	 * 临时开启bouncing，渲染一帧，然后自动关闭
	 * @param {WebGLRenderer} renderer - 渲染器
	 * @param {WebGLRenderTarget} writeBuffer - 写入缓冲区
	 * @param {number} [refreshFrames=1] - 刷新帧数，默认为1
	 * @returns {Promise} 返回一个Promise，当刷新完成时解析
	 */
	refring = false;
	refreshReflection() {

		if (this.refring) { return; }
		this.refring = true;
		// 保存原始状态
		const oldBouncing = this._bouncing;
		this.setBouncing(true);
		// 强制更新材质
		setTimeout(() => {

			this.setBouncing(oldBouncing);
			this.refring = false;

		});
		// 渲染指定的帧数
		// 开始刷新渲染

	}

	setBouncing(val) {

		if (this._bouncing === val) { return; }
		this._bouncing = val;
		if (val) {

			this.ssrMaterial.uniforms.tDiffuse.value = this.prevRenderTarget.texture;

		} else {

			// Use G-Buffer color or fallback to beauty buffer
			// if (this.usingGBuffer && this.gBufferTextures && this.gBufferTextures.gColor) {
			// 	this.ssrMaterial.uniforms.tDiffuse.value = this.gBufferTextures.gColor;
			// } else {
			this.ssrMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
			// }

		}

	}

	/**
	 * 指示遮罩是否应该反转（反转选择物体的反射效果）
	 *
	 * @type {Boolean}
	 */
	get inverted() {

		return this._inverted;

	}

	set inverted(value) {

		this._inverted = value;
		if (this.depthMaskMaterial) {

			this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;

		}

	}

	/**
	 * 指示是否忽略背景（不对背景应用反射效果）
	 *
	 * @type {Boolean}
	 */
	get ignoreBackground() {

		return this._ignoreBackground;

	}

	set ignoreBackground(value) {

		this._ignoreBackground = value;
		if (this.depthMaskMaterial) {

			this.depthMaskMaterial.maxDepthStrategy = value ?
				DepthTestStrategy.DISCARD_MAX_DEPTH :
				DepthTestStrategy.KEEP_MAX_DEPTH;

		}

	}

	/**
	 * 向选择集添加对象
	 * @param {THREE.Object3D} object - 要添加的对象
	 */
	addToSelection(object) {

		if (!object) { return; }
		if (this._selection && typeof this._selection.add === "function") {

			this._selection.add(object);
			console.log(`已添加对象到SSR选择集: ${object.name || object.uuid}`);

		} else {

			console.warn("无法添加对象到选择集，Selection对象不可用");

		}

	}

	/**
	 * 从选择集中移除对象
	 * @param {THREE.Object3D} object - 要移除的对象
	 */
	removeFromSelection(object) {

		if (!object) { return; }
		if (this._selection && typeof this._selection.delete === "function") {

			this._selection.delete(object);
			console.log(`已从SSR选择集移除对象: ${object.name || object.uuid}`);

		} else {

			console.warn("无法从选择集移除对象，Selection对象不可用");

		}

	}

	/**
	 * 清空选择集
	 */
	clearSelection() {

		if (this._selection && typeof this._selection.clear === "function") {

			this._selection.clear();
			console.log("已清空SSR选择集");

		} else {

			console.warn("无法清空选择集，Selection对象不可用");

		}

	}

	/**
	 * 切换对象在选择集中的状态
	 * @param {THREE.Object3D} object - 要切换状态的对象
	 */
	toggleSelection(object) {

		if (!object) { return; }
		if (this._selection) {

			if (this._selection.has(object)) {

				this.removeFromSelection(object);

			} else {

				this.addToSelection(object);

			}

		}

	}

	/**
	 * 获取当前选择集中的所有对象
	 * @returns {Array} - 选择集中的对象数组
	 */
	getSelectionItems() {

		if (!this._selection) { return []; }

		// 检查各种可能的访问方式
		if (Array.isArray(this._selection.items)) {

			return this._selection.items;

		}

		if (Array.isArray(this._selection.objects)) {

			return this._selection.objects;

		}

		if (typeof this._selection.getItems === "function") {

			return this._selection.getItems();

		}

		if (typeof this._selection.getSelection === "function") {

			return this._selection.getSelection();

		}

		// 如果Selection是一个可迭代对象
		if (typeof this._selection[Symbol.iterator] === "function") {

			return Array.from(this._selection);

		}

		console.warn("无法确定Selection API的使用方式");
		return [];

	}

	/**
	 * 初始化效果
	 *
	 * @param {WebGLRenderer} renderer - 渲染器
	 * @param {Boolean} alpha - 是否有alpha通道
	 * @param {Number} frameBufferType - 帧缓冲区类型
	 */
	initialize(renderer, alpha, frameBufferType) {

		// 确保所有通道和材质正确初始化
		if (this.depthPass) {

			this.depthPass.initialize(renderer, alpha, frameBufferType);

		}

		if (this.maskPass) {

			this.maskPass.initialize(renderer, alpha, frameBufferType);

		}

		// 检查渲染器是否支持对数深度缓冲
		if (renderer.capabilities.logarithmicDepthBuffer) {

			if (this.depthMaskMaterial) {

				this.depthMaskMaterial.defines.LOG_DEPTH = "1";
				this.depthMaskMaterial.needsUpdate = true;

			}

		}

	}

	/**
	 * 基于金属度自动选择对象并添加到selection
	 * @param {Number} threshold - 金属度阈值，超过该值的对象将被选中
	 */
	updateSelectionBasedOnMetalness(threshold = 0.5) {

		if (!this._selection || !this.scene) { return; }

		// 清空当前选择
		this.clearSelection();

		// 遍历场景中的所有对象
		this.scene.traverseVisible(object => {

			// 检查对象是否有材质且是网格
			if (object.isMesh && object.material) {

				let metalness = 0;

				// 处理单一材质
				if (!Array.isArray(object.material)) {

					if (object.material.metalness !== undefined) {

						metalness = object.material.metalness;

					}

				}
				// 处理多材质数组
				else {

					let totalMetalness = 0;
					let validMaterials = 0;

					for (const mat of object.material) {

						if (mat.metalness !== undefined) {

							totalMetalness += mat.metalness;
							validMaterials++;

						}

					}

					if (validMaterials > 0) {

						metalness = totalMetalness / validMaterials;

					}

				}

				// 如果金属度超过阈值，添加到选择中
				if (metalness >= threshold) {

					this.addToSelection(object);

				}

			}

		});

		console.log(`基于金属度 >= ${threshold} 更新选择，共选中 ${this.getSelectionItems().length} 个对象`);

	}

	/**
	 * 设置金属度阈值，并更新选择
	 * @param {Number} threshold - 金属度阈值
	 */
	setMetalnessThreshold(threshold) {

		this.updateSelectionBasedOnMetalness(threshold);

	}

	/**
	 * 设置是否高亮显示选中的对象
	 * @param {Boolean} highlight - 是否高亮显示
	 * @param {Number} [emissiveValue=2.0] - 高亮的发光值
	 */
	setHighlightSelected(highlight, emissiveValue = 2.0) {

		const selectedObjects = this.getSelectionItems();

		// 存储原始材质状态
		if (!this.originalEmissives) {

			this.originalEmissives = new Map();

		}

		selectedObjects.forEach(object => {

			if (object.isMesh && object.material) {

				// 存储原始发光值（如果尚未存储）
				if (!this.originalEmissives.has(object.uuid)) {

					if (Array.isArray(object.material)) {

						const emissives = [];
						object.material.forEach(mat => {

							if (mat.emissive) {

								emissives.push(mat.emissive.clone());

							} else {

								emissives.push(null);

							}

						});
						this.originalEmissives.set(object.uuid, emissives);

					} else if (object.material.emissive) {

						this.originalEmissives.set(object.uuid, object.material.emissive.clone());

					}

				}

				// 应用或恢复发光值
				if (Array.isArray(object.material)) {

					object.material.forEach((mat, index) => {

						if (mat.emissive) {

							if (highlight) {

								mat.emissive.set(emissiveValue, emissiveValue, emissiveValue);

							} else {

								const original = this.originalEmissives.get(object.uuid);
								if (original && original[index]) {

									mat.emissive.copy(original[index]);

								}

							}

						}

					});

				} else if (object.material.emissive) {

					if (highlight) {

						object.material.emissive.set(emissiveValue, emissiveValue, emissiveValue);

					} else {

						const original = this.originalEmissives.get(object.uuid);
						if (original) {

							object.material.emissive.copy(original);

						}

					}

				}

			}

		});

		console.log(`${highlight ? "启用" : "禁用"}选中对象高亮显示`);

	}

	/**
	 * 设置掩码阈值
	 * @param {Number} threshold - 掩码阈值
	 */
	setMaskThreshold(threshold) {

		if (this.ssrMaterial) {

			this.ssrMaterial.uniforms.maskThreshold.value = threshold;
			console.log(`设置掩码阈值为 ${threshold}`);

		}

	}

}

SelectiveSSRPass.OUTPUT = {
	"Default": 0,
	"SSR": 1,
	"Beauty": 3,
	"Depth": 4,
	"Normal": 5,
	"Metalness": 7,
	"Mask": 8,
	"Debug": 9, // 新增Debug模式用于直接显示着色器效果
	"GBufferColor": 10, // G-Buffer颜色通道
	"GBufferPosition": 11 // G-Buffer位置通道
};

/**
 * 设置输出模式
 * @param {Number} mode - 输出模式，使用SelectiveSSRPass.OUTPUT枚举
 */
SelectiveSSRPass.prototype.setOutputMode = function (mode) {

	this.output = mode;
	console.log(`已设置输出模式：${Object.keys(SelectiveSSRPass.OUTPUT).find(key => SelectiveSSRPass.OUTPUT[key] === mode) || "未知"}`);

};

/**
 * 循环切换输出模式，便于调试
 */
SelectiveSSRPass.prototype.cycleOutputMode = function () {

	const modes = Object.values(SelectiveSSRPass.OUTPUT);
	const currentIndex = modes.indexOf(this.output);
	const nextIndex = (currentIndex + 1) % modes.length;
	this.setOutputMode(modes[nextIndex]);

};

export { SelectiveSSRPass };