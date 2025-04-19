import {
	BasicDepthPacking,
	Color,
	EqualDepth,
	NotEqualDepth,
	RGBADepthPacking,
	SRGBColorSpace,
	WebGLRenderTarget,
	MeshBasicMaterial,
	AlwaysStencilFunc,
	EqualStencilFunc,
	NotEqualStencilFunc,
	ReplaceStencilOp,
	KeepStencilOp,
	Uniform
} from "three";
import * as THREE from "three";

import { Selection } from "../core/Selection.js";
import { DepthTestStrategy } from "../enums/DepthTestStrategy.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import { DepthMaskMaterial } from "../materials/DepthMaskMaterial.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { CopyPass } from "../passes/CopyPass.js";
import { log, timeEndLog, timeLog } from "../utils/PerformanceLogger.js";
import { BloomEffect } from "./BloomEffect.js";
import { renderUtils } from "../utils/RenderUtils.js";

/**
 * A selective bloom effect.
 *
 * This effect applies bloom to selected objects only.
 * 
 * Supports two operating modes:
 * 1. Depth-based mode (default): Uses depth comparison to isolate selected objects
 * 2. Emissive mode: Temporarily increases the emissive property of selected objects' materials
 */

export class SelectiveBloomEffect extends BloomEffect {

	/**
	 * Constructs a new selective bloom effect.
	 *
	 * @param {Scene} scene - The main scene.
	 * @param {Camera} camera - The main camera.
	 * @param {Object} [options] - The options. See {@link BloomEffect} for details.
	 */

	constructor(scene, camera, options) {

		super(options);

		this.setAttributes(this.getAttributes() | EffectAttribute.DEPTH);

		/**
		 * The main camera.
		 *
		 * @type {Camera}
		 * @private
		 */
		this.scene = scene;
		this.camera = camera;

		/**
		 * 渲染模式选项
		 * - 'depth'：使用深度掩码（原有方式）
		 * - 'stencil'：使用模板缓冲（新方式）
		 * - 'emissive'：使用自发光模式
		 * 
		 * @type {String}
		 * @private
		 */
		this._renderMode = options.renderMode || 'depth';

		/**
		 * 非选中对象的泛光强度，范围[0-1]
		 * 0表示无泛光效果，1表示和选中对象相同的强度
		 * @type {Number}
		 */
		this.unselectedBloomStrength = options.unselectedBloomStrength !== undefined ? options.unselectedBloomStrength : 0.1;

		/**
		 * A depth pass.
		 *
		 * @type {DepthPass}
		 * @private
		 */

		this.depthPass = new DepthPass(scene, camera);

		/**
		 * A clear pass.
		 *
		 * @type {ClearPass}
		 * @private
		 */

		this.clearPass = new ClearPass(true, false, false);
		this.clearPass.overrideClearColor = new Color(0x000000);

		/**
		 * A copy pass for stencil operations.
		 *
		 * @type {CopyPass}
		 * @private
		 */
		this.copyPass = new CopyPass();

		/**
		 * A depth mask pass.
		 *
		 * @type {ShaderPass}
		 * @private
		 */

		this.depthMaskPass = new ShaderPass(new DepthMaskMaterial());

		const depthMaskMaterial = this.depthMaskMaterial;
		depthMaskMaterial.copyCameraSettings(camera);
		depthMaskMaterial.depthBuffer1 = this.depthPass.texture;
		depthMaskMaterial.depthPacking1 = RGBADepthPacking;
		depthMaskMaterial.depthMode = EqualDepth;
		// this.depthMaskMaterial.epsilon = 0.000009; // 深度比较容差

		/**
		 * A render target.
		 *
		 * @type {WebGLRenderTarget}
		 * @private
		 */

		this.renderTargetMasked = new WebGLRenderTarget(1, 1, { depthBuffer: false });
		this.renderTargetMasked.texture.name = "Bloom.Masked";

		/**
		 * A selection of objects.
		 *
		 * @type {Selection}
		 * @readonly
		 */

		this.selection = new Selection();

		/**
		 * Backing data for {@link inverted}.
		 *
		 * @type {Boolean}
		 * @private
		 */

		this._inverted = false;

		/**
		 * Backing data for {@link ignoreBackground}.
		 *
		 * @type {Boolean}
		 * @private
		 */

		this._ignoreBackground = false;

		/**
		 * Backing data for {@link useEmissiveMode}.
		 *
		 * @type {Boolean}
		 * @private
		 */

		this._useEmissiveMode = false;

		/**
		 * Map to store original material emissive values.
		 *
		 * @type {Map}
		 * @private
		 */

		this.originalEmissiveMap = new Map();

		/**
		 * High emissive intensity for selected objects.
		 *
		 * @type {Number}
		 */

		this.emissiveIntensity = 2.0;

		/**
		 * 模板缓冲渲染相关资源
		 * @type {Object}
		 * @private
		 */
		this.stencilResources = null;

		// 如果选择了stencil模式，初始化模板资源
		if (this._renderMode === 'stencil') {
			this.initStencilResources();
		}

		// 添加用于存储模板缓冲结果的纹理
		this.uniforms.get("stencilTexture").value = null;

		// 添加到uniform以便在着色器中使用
		this.uniforms.get("unselectedBloomStrength").value = this.unselectedBloomStrength;
	}

	set mainScene(value) {

		this.depthPass.mainScene = value;

	}

	set mainCamera(value) {

		this.camera = value;
		this.depthPass.mainCamera = value;
		this.depthMaskMaterial.copyCameraSettings(value);

	}

	/**
	 * Returns the selection.
	 *
	 * @deprecated Use selection instead.
	 * @return {Selection} The selection.
	 */

	getSelection() {

		return this.selection;

	}

	/**
	 * The depth mask material.
	 *
	 * @type {DepthMaskMaterial}
	 * @private
	 */

	get depthMaskMaterial() {

		return this.depthMaskPass.fullscreenMaterial;

	}

	/**
	 * Indicates whether the selection should be considered inverted.
	 *
	 * @type {Boolean}
	 */

	get inverted() {

		return this._inverted;

	}

	set inverted(value) {

		this._inverted = value;
		this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;

	}

	/**
	 * Indicates whether the mask is inverted.
	 *
	 * @deprecated Use inverted instead.
	 * @return {Boolean} Whether the mask is inverted.
	 */

	isInverted() {

		return this.inverted;

	}

	/**
	 * Enables or disable mask inversion.
	 *
	 * @deprecated Use inverted instead.
	 * @param {Boolean} value - Whether the mask should be inverted.
	 */

	setInverted(value) {

		this.inverted = value;

	}

	/**
	 * Indicates whether the background colors will be ignored.
	 *
	 * @type {Boolean}
	 */

	get ignoreBackground() {

		return this._ignoreBackground;

	}

	set ignoreBackground(value) {

		this._ignoreBackground = value;
		this.depthMaskMaterial.maxDepthStrategy = value ?
			DepthTestStrategy.DISCARD_MAX_DEPTH :
			DepthTestStrategy.KEEP_MAX_DEPTH;

	}

	/**
	 * Indicates whether the background is disabled.
	 *
	 * @deprecated Use ignoreBackground instead.
	 * @return {Boolean} Whether the background is disabled.
	 */

	isBackgroundDisabled() {

		return this.ignoreBackground;

	}

	/**
	 * Enables or disables the background.
	 *
	 * @deprecated Use ignoreBackground instead.
	 * @param {Boolean} value - Whether the background should be disabled.
	 */

	setBackgroundDisabled(value) {

		this.ignoreBackground = value;

	}

	/**
	 * Sets the depth texture.
	 *
	 * @param {Texture} depthTexture - A depth texture.
	 * @param {DepthPackingStrategies} [depthPacking=BasicDepthPacking] - The depth packing.
	 */

	setDepthTexture(depthTexture, depthPacking = BasicDepthPacking) {

		this.depthMaskMaterial.depthBuffer0 = depthTexture;
		this.depthMaskMaterial.depthPacking0 = depthPacking;

	}

	/**
	 * Updates this effect.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
	 * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
	 * @param {DepthPass} [depthPass] - An optional shared depth pass for optimized rendering.
	 */

	update(renderer, inputBuffer, deltaTime, depthPass) {

		// const renderState = renderUtils.setRenderState({
		// 	renderer,
		// 	scene: this.scene,
		// 	forceState: false
		// })
		//准备修改
		// if (this.scene) {
		// 	const oldMatrixAutoUpdate = this.scene.matrixWorldAutoUpdate;
		// 	this.scene.matrixWorldAutoUpdate = false
		// }
		const camera = this.camera;
		const selection = this.selection;
		const inverted = this.inverted;
		let renderTarget = inputBuffer;

		timeLog("SelectiveBloomEffect.update");
		log("SelectiveBloomEffect update called, selection size:", selection.size);

		// 设置着色器中的isEmissiveMode参数
		this.uniforms.get("isEmissiveMode").value = this._renderMode === 'emissive';

		// 确保stencilTexture开始时为null，避免显示上一帧的结果
		if (this._debugMode !== 2) {
			this.uniforms.get("stencilTexture").value = null;
		}

		// 根据渲染模式选择不同的处理方式
		if (this._renderMode === 'emissive') {
			// === 自发光模式 ===
			timeLog("SelectiveBloomEffect.update.emissiveMode");
			// 应用自发光模式
			this.applyEmissiveMode();

			// 在自发光模式下直接使用inputBuffer，不需要mask处理
			renderTarget = inputBuffer;

			// 创建一个临时的stencilTexture，用于在着色器中差异化处理
			if (this.selection.size > 0) {
				// 渲染选定对象的深度
				const mask = camera.layers.mask;
				camera.layers.set(selection.layer);
				this.depthPass.render(renderer);
				camera.layers.mask = mask;

				// 使用深度纹理作为stencilTexture
				this.uniforms.get("stencilTexture").value = this.depthPass.texture;
			}

			timeEndLog("SelectiveBloomEffect.update.emissiveMode");

		} else if (this._renderMode === 'stencil') {
			// === 模板缓冲模式 ===
			if (this.ignoreBackground || !inverted || selection.size > 0) {
				renderTarget = this.renderWithStencilBuffer(renderer, inputBuffer);

				// 在调试模式下stencilTexture已经在renderWithStencilBuffer中设置
				if (this._debugMode !== 2 && this.stencilResources && this.stencilResources.renderTarget) {
					this.uniforms.get("stencilTexture").value = this.stencilResources.renderTarget.texture;
				}
			}

		} else {
			// === 深度掩码模式(默认) ===
			if (this.ignoreBackground || !inverted || selection.size > 0) {
				// 使用共享的深度通道或渲染自己的深度
				//用了会有bug 不能为true
				if (false) {
					timeLog("SelectiveBloomEffect.update.useSharedDepthPass");
					// 根据 DepthMaskMaterial 源码，设置深度纹理有两种方式：
					// 1. 使用 setDepthBuffer1 方法
					// 2. 分别设置 depthBuffer1 和 depthPacking1 属性
					if (typeof this.depthMaskMaterial.setDepthBuffer1 === 'function') {
						// 优先使用专门的设置方法
						this.depthMaskMaterial.setDepthBuffer1(depthPass.texture, depthPass.depthPacking || RGBADepthPacking);
					} else {
						// 回退到单独设置属性
						this.depthMaskMaterial.depthBuffer1 = depthPass.texture;
						this.depthMaskMaterial.depthPacking1 = depthPass.depthPacking || RGBADepthPacking;
					}
					timeEndLog("SelectiveBloomEffect.update.useSharedDepthPass");
				} else {
					// 渲染选定对象的深度
					timeLog("SelectiveBloomEffect.update.depthPass");
					const mask = camera.layers.mask;
					camera.layers.set(selection.layer);
					this.depthPass.render(renderer, undefined, undefined, undefined, undefined, undefined, {
						projectObject: true,
						updateMatrixWorld: false,
						useProgramCache: false,
					});
					camera.layers.mask = mask;
					timeEndLog("SelectiveBloomEffect.update.depthPass");
				}

				// 基于深度丢弃颜色
				timeLog("SelectiveBloomEffect.update.maskRender");
				renderTarget = this.renderTargetMasked;
				this.clearPass.render(renderer, renderTarget);
				this.depthMaskPass.render(renderer, inputBuffer, renderTarget, undefined, undefined, {
					projectObject: true,
					updateMatrixWorld: false,
					useProgramCache: false,
				});
				timeEndLog("SelectiveBloomEffect.update.maskRender");
			}

			// 在深度模式下，使用深度纹理作为stencilTexture
			this.uniforms.get("stencilTexture").value = this.depthPass.texture;
		}
		this.uniforms.get("maskTexture").value = renderTarget.texture;

		// 正常渲染泛光纹理
		timeLog("SelectiveBloomEffect.update.superUpdate");
		super.update(renderer, renderTarget, deltaTime);
		timeEndLog("SelectiveBloomEffect.update.superUpdate");

		// 如果使用自发光模式，每帧结束后恢复原始材质设置
		if (this._renderMode === 'emissive') {
			this.restoreOriginalEmissive();
		}

		timeEndLog("SelectiveBloomEffect.update");
		//准备修改
		// this.scene.matrixWorldAutoUpdate = oldMatrixAutoUpdate;
	}

	/**
	 * Updates the size of internal render targets.
	 *
	 * @param {Number} width - The width.
	 * @param {Number} height - The height.
	 */

	setSize(width, height) {

		super.setSize(width, height);
		this.renderTargetMasked.setSize(width, height);
		this.depthPass.setSize(width, height);

		// 同时更新模板缓冲相关的渲染目标大小
		if (this.stencilResources) {
			if (this.stencilResources.renderTarget) {
				this.stencilResources.renderTarget.setSize(width, height);
			}
			if (this.stencilResources.debugRenderTarget) {
				this.stencilResources.debugRenderTarget.setSize(width, height);
			}
		}
	}

	/**
	 * Performs initialization tasks.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {Boolean} alpha - Whether the renderer uses the alpha channel.
	 * @param {Number} frameBufferType - The type of the main frame buffers.
	 */

	initialize(renderer, alpha, frameBufferType) {

		super.initialize(renderer, alpha, frameBufferType);

		this.clearPass.initialize(renderer, alpha, frameBufferType);
		this.depthPass.initialize(renderer, alpha, frameBufferType);
		this.depthMaskPass.initialize(renderer, alpha, frameBufferType);

		if (renderer !== null && renderer.capabilities.logarithmicDepthBuffer) {

			this.depthMaskPass.fullscreenMaterial.defines.LOG_DEPTH = "1";

		}

		if (frameBufferType !== undefined) {

			this.renderTargetMasked.texture.type = frameBufferType;

			if (renderer !== null && renderer.outputColorSpace === SRGBColorSpace) {

				this.renderTargetMasked.texture.colorSpace = SRGBColorSpace;

			}

		}

	}

	/**
	 * Indicates whether to use emissive mode instead of depth mask mode.
	 *
	 * @type {Boolean}
	 */

	get useEmissiveMode() {

		return this._useEmissiveMode;

	}

	set useEmissiveMode(value) {

		// If toggling from true to false, restore original emissive values
		if (this._useEmissiveMode && !value) {
			this.restoreOriginalEmissive();
		}

		this._useEmissiveMode = value;

	}

	/**
	 * Stores original emissive values for an object's materials.
	 *
	 * @private
	 * @param {Object3D} object - The object to store emissive values for.
	 */

	storeOriginalEmissive(object) {

		if (!this.originalEmissiveMap.has(object.uuid)) {
			const materials = [];

			// Handle object with a single material
			if (object.material) {
				if (Array.isArray(object.material)) {
					// Multi-material
					for (const material of object.material) {
						if (material.emissive) {
							materials.push({
								material: material,
								emissive: material.emissive.clone(),
								emissiveIntensity: material.emissiveIntensity || 1.0
							});
						}
					}
				} else if (object.material.emissive) {
					// Single material
					materials.push({
						material: object.material,
						emissive: object.material.emissive.clone(),
						emissiveIntensity: object.material.emissiveIntensity || 1.0
					});
				}
			}

			if (materials.length > 0) {
				this.originalEmissiveMap.set(object.uuid, materials);
			}
		}

	}

	/**
	 * Restores original emissive values for all modified objects.
	 *
	 * @private
	 */

	restoreOriginalEmissive() {

		for (const [, materialDataArray] of this.originalEmissiveMap) {
			for (const { material, emissive, emissiveIntensity } of materialDataArray) {
				// 确保材质对象仍然存在
				if (material) {
					// 使用copy方法避免引用问题
					material.emissive.copy(emissive);
					material.emissiveIntensity = emissiveIntensity;

					// 确保材质更新标记设置为true
					if (material.needsUpdate !== undefined) {
						material.needsUpdate = true;
					}
				}
			}
		}

		// 清空存储的原始数据
		this.originalEmissiveMap.clear();

	}


	/**
	 * Apply emissive mode to selected objects.
	 *
	 * @private
	 */

	applyEmissiveMode() {
		const selection = this.selection;
		const intensity = 1.0; // 自发光强度

		// 存储并修改选定对象的emissive和emissiveIntensity属性
		if (!this._originalEmissive) {
			this._originalEmissive = new Map();
		}

		selection.forEach(object => {
			if (object.material) {
				const materials = Array.isArray(object.material) ? object.material : [object.material];

				materials.forEach(material => {
					if (material.emissive) {
						// 存储原始值
						if (!this._originalEmissive.has(material)) {
							this._originalEmissive.set(material, {
								emissive: material.emissive.clone(),
								intensity: material.emissiveIntensity || 1.0
							});
						}

						// 设置为白色发光 (或其他颜色)
						material.emissive.setRGB(1, 1, 1);
						material.emissiveIntensity = intensity;
					}
				});
			}
		});
	}

	/**
	 * 恢复对象的原始自发光属性
	 * @private
	 */
	restoreOriginalEmissive() {
		if (!this._originalEmissive) return;

		// 恢复所有材质的原始发光属性
		this._originalEmissive.forEach((data, material) => {
			if (material.emissive) {
				material.emissive.copy(data.emissive);
				material.emissiveIntensity = data.intensity;
			}
		});

		// 清空存储
		this._originalEmissive.clear();
	}

	/**
	 * 覆盖父类的tint getter
	 * 
	 * @type {Color}
	 */
	get tint() {
		return this._tint || super.tint;
	}

	/**
	 * 覆盖父类的tint setter
	 * 
	 * @param {Color|String|Number} value - 新的tint颜色
	 */
	set tint(value) {
		// 调用父类的setter
		super.tint = value;

		// 同时更新本地存储
		if (!this._tint) {
			this._tint = new Color();
		}
		this._tint.set(value);
	}

	/**
	 * 当前渲染模式
	 * @type {String}
	 */
	get renderMode() {
		return this._renderMode;
	}

	set renderMode(value) {
		// 如果没有变化，直接返回
		if (this._renderMode === value) return;

		// 如果从其他模式切换到stencil模式，初始化资源
		if (value === 'stencil' && this._renderMode !== 'stencil') {
			this.initStencilResources();
		}

		// 如果从stencil模式切换到其他模式，清理资源
		if (this._renderMode === 'stencil' && value !== 'stencil') {
			this.disposeStencilResources();
		}

		// 如果切换到emissive模式，设置useEmissiveMode为true
		this.useEmissiveMode = (value === 'emissive');

		this._renderMode = value;
	}

	/**
	 * 初始化模板缓冲资源
	 * @private
	 */
	initStencilResources() {
		// 确保清理之前的资源
		this.disposeStencilResources();

		// 创建包含模板缓冲的渲染目标
		const renderTargetOptions = {
			stencilBuffer: true,     // 启用模板缓冲
			depthBuffer: true,       // 保留深度信息
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter
		};

		// 用于模板操作的渲染目标
		this.stencilResources = {
			// 渲染目标，与原始渲染目标大小相同
			renderTarget: new WebGLRenderTarget(1, 1, renderTargetOptions),

			// 用于可视化调试的渲染目标
			debugRenderTarget: new WebGLRenderTarget(1, 1, { depthBuffer: false }),

			// 用于写入模板的材质
			stencilWriteMaterial: new MeshBasicMaterial({
				colorWrite: false,      // 不写入颜色缓冲
				depthWrite: false,      // 不写入深度缓冲
				stencilWrite: true,     // 启用模板写入
				stencilRef: 1,          // 写入值1
				stencilFunc: AlwaysStencilFunc,    // 总是写入
				stencilFail: KeepStencilOp,        // 测试失败时保持
				stencilZFail: KeepStencilOp,       // Z测试失败时保持
				stencilZPass: ReplaceStencilOp     // Z测试通过时替换为ref值
			}),

			// 用于可视化模板缓冲的材质（调试用）
			stencilVisualizeMaterial: new MeshBasicMaterial({
				color: new Color(1, 0, 0),     // 明亮的红色
				transparent: true,             // 启用透明
				opacity: 0.7,                  // 半透明
				depthTest: false               // 禁用深度测试以确保可见
			}),

			// 保存材质映射
			originalMaterials: new Map()
		};

		// 设置渲染目标的大小
		const width = this.resolution.width;
		const height = this.resolution.height;
		this.stencilResources.renderTarget.setSize(width, height);
		this.stencilResources.debugRenderTarget.setSize(width, height);
	}

	/**
	 * 清理模板缓冲资源
	 * @private
	 */
	disposeStencilResources() {
		if (this.stencilResources) {
			// 处理后释放渲染目标
			if (this.stencilResources.renderTarget) {
				this.stencilResources.renderTarget.dispose();
			}

			if (this.stencilResources.debugRenderTarget) {
				this.stencilResources.debugRenderTarget.dispose();
			}

			// 释放材质
			if (this.stencilResources.stencilWriteMaterial) {
				this.stencilResources.stencilWriteMaterial.dispose();
			}

			if (this.stencilResources.stencilVisualizeMaterial) {
				this.stencilResources.stencilVisualizeMaterial.dispose();
			}

			this.stencilResources = null;
		}
	}

	/**
	 * 使用模板缓冲渲染选中对象
	 * @param {WebGLRenderer} renderer - 渲染器
	 * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
	 * @return {WebGLRenderTarget} 处理后的渲染目标
	 * @private
	 */
	renderWithStencilBuffer(renderer, inputBuffer) {
		const { selection, scene, camera, inverted } = this;
		const resources = this.stencilResources;

		if (!resources) return inputBuffer;

		console.log("renderWithStencilBuffer");

		// 第1步：将输入缓冲内容复制到模板渲染目标
		this.copyPass.render(renderer, inputBuffer, resources.renderTarget);

		// 第2步：将选中对象标记到模板缓冲
		timeLog("SelectiveBloomEffect.renderWithStencilBuffer.markObjects");

		// 保存材质
		const originalMaterials = resources.originalMaterials;
		originalMaterials.clear();

		// 根据选择和反转设置，确定要处理的对象
		const objectsToMark = [];

		if (inverted) {
			// 如果是反转，则标记所有非选中对象
			scene.traverse(obj => {
				if (obj.isMesh && !selection.has(obj)) {
					objectsToMark.push(obj);
				}
			});
		} else {
			// 否则只标记选中对象
			for (const obj of selection) {
				if (obj.isMesh) {
					objectsToMark.push(obj);

					// 处理对象的子对象
					if (obj.children && obj.children.length > 0) {
						obj.traverse(child => {
							if (child !== obj && child.isMesh) {
								objectsToMark.push(child);
							}
						});
					}
				}
			}
		}

		// 如果是调试模式2，创建清晰的调试视图
		if (this._debugMode === 2) {
			// 创建调试视图：在黑色背景上显示选中的对象
			renderer.setRenderTarget(resources.debugRenderTarget);
			renderer.setClearColor(0x000000, 1);
			renderer.clear();

			// 用红色半透明材质渲染选中对象
			for (const obj of objectsToMark) {
				originalMaterials.set(obj, obj.material);
				obj.material = resources.stencilVisualizeMaterial;
			}

			// 渲染场景到调试渲染目标
			renderer.render(scene, camera);

			// 恢复原始材质
			for (const [obj, material] of originalMaterials) {
				obj.material = material;
			}

			// 保存调试渲染目标的纹理用于显示
			this.uniforms.get("stencilTexture").value = resources.debugRenderTarget.texture;

			// 继续常规模板渲染处理
			originalMaterials.clear();
		}

		// 替换材质
		for (const obj of objectsToMark) {
			originalMaterials.set(obj, obj.material);
			obj.material = resources.stencilWriteMaterial;
		}

		// 保存当前渲染状态
		const autoClear = renderer.autoClear;
		renderer.autoClear = false;

		// 只清除模板缓冲
		renderer.clearStencil();

		// 渲染到模板缓冲 - 这一步只写入模板值，不写入颜色
		renderer.setRenderTarget(resources.renderTarget);
		renderer.render(scene, camera);

		// 恢复材质
		for (const [obj, material] of originalMaterials) {
			obj.material = material;
		}

		timeEndLog("SelectiveBloomEffect.renderWithStencilBuffer.markObjects");

		// 第3步：使用模板测试筛选像素
		timeLog("SelectiveBloomEffect.renderWithStencilBuffer.stencilTest");

		// 设置模板测试 - 只渲染模板值匹配的像素
		renderer.state.buffers.stencil.setTest(true);
		renderer.state.buffers.stencil.setFunc(
			inverted ? NotEqualStencilFunc : EqualStencilFunc,
			1,    // 参考值
			0xFF  // 掩码
		);

		// 设置渲染目标
		renderer.setRenderTarget(this.renderTargetMasked);

		// 清除颜色
		this.clearPass.render(renderer, this.renderTargetMasked);

		// 渲染场景
		renderer.render(scene, camera);

		// 禁用模板测试
		renderer.state.buffers.stencil.setTest(false);

		// 恢复渲染状态
		renderer.autoClear = autoClear;

		timeEndLog("SelectiveBloomEffect.renderWithStencilBuffer.stencilTest");
		timeEndLog("SelectiveBloomEffect.renderWithStencilBuffer");

		// 返回经过模板测试的渲染目标
		return this.renderTargetMasked;
	}

	/**
	 * Debug模式选项
	 * 0: 正常渲染
	 * 1: 显示选中层
	 * 2: 显示模板缓冲区（仅在stencil模式有效）
	 */
	get debugMode() {
		return this._debugMode || 0;
	}

	set debugMode(value) {
		this._debugMode = value;
		this.uniforms.get("debugMode").value = value;
	}

}
