import { Effect, Selection, NormalPass, RenderPass, ClearPass } from "postprocessing";
import { Color, Uniform, Layers, WebGLRenderTarget, LinearFilter, HalfFloatType, NoBlending, DepthTexture } from "three";
import { TRAAEffect } from "../../index";
import ao_compose from "./shader/ao_compose.frag";
import { PoissionDenoisePass } from "../pass/PoissionDenoisePass";
import { DepthComparisonMaterial, DepthPass } from "postprocessing";

const defaultAOOptions = {
	resolutionScale: 1,
	spp: 8,
	distance: 2,
	distancePower: 1,
	power: 2,
	bias: 40,
	thickness: 0.075,
	color: new Color("black"),
	brightnessThreshold: 0.7,
	debugMode: 0,
	ignoreSelection: null,
	highlightValue: 0.8,
	closeAutoUpdate: false,
	useNormalPass: false,
	velocityDepthNormalPass: null,
	normalTexture: null,
	renderBefore: () => {
	},
	...PoissionDenoisePass.DefaultOptions
};

export class SelectiveAOEffect extends Effect {

	constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {

		// 合并选项
		options = {
			...defaultAOOptions,
			...options
		};

		// 使用AO着色器作为基础效果着色器
		super("AOEffect", ao_compose, {
			type: "FinalAOMaterial",
			uniforms: new Map([
				["inputTexture", new Uniform(null)],
				["inputBuffer", new Uniform(null)],
				["depthTexture", new Uniform(null)],
				["maskTexture", new Uniform(null)],
				["power", new Uniform(0)],
				["color", new Uniform(new Color("black"))],
				["brightnessThreshold", new Uniform(0.7)],
				["debugMode", new Uniform(0)]
			])
		});

		// 存储上次大小设置
		this.lastSize = {
			width: 0,
			height: 0,
			resolutionScale: 0
		};

		// 保存引用
		this.composer = composer;
		this.aoPass = aoPass;
		this.options = options;
		this.scene = scene;
		this.camera = camera;

		// 初始化Selection对象
		this._ignoreSelection = options.ignoreSelection || new Selection();

		// 创建遮罩渲染目标
		this.renderTargetMask = new WebGLRenderTarget(1, 1, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
			depthBuffer: true
		});
		this.renderTargetMask.texture.name = "AO.Mask";
		this.uniforms.get("maskTexture").value = this.renderTargetMask.texture;

		// 存储原始材质状态的映射
		this.originalMaterials = new Map();

		// 创建专用于AO的渲染目标
		this.createRenderTargets();

		// 创建基本渲染通道
		this.renderPass = new RenderPass(scene, camera);
		this.renderPass.clear = true;

		// 创建深度通道
		this.depthPass = new DepthPass(scene, camera);

		// 创建深度比较遮罩通道 - 参考OutlineEffect的实现
		this.maskPass = new RenderPass(scene, camera, new DepthComparisonMaterial(this.depthPass.texture, camera));
		const clearPass = this.maskPass.clearPass;
		clearPass.overrideClearColor = new Color(0xffffff);
		clearPass.overrideClearAlpha = 1;

		// 清除通道，用于在不同渲染步骤间清除
		this.clearPass = new ClearPass(true, false, false);
		this.clearPass.overrideClearColor = new Color(0x000000);
		this.clearPass.overrideClearAlpha = 1;

		// 存储原始发光值的映射
		this.originalEmissives = new Map();

		// 设置深度纹理
		if (!composer.depthTexture) { composer.createDepthTexture(); }
		this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = composer.depthTexture;
		this.uniforms.get("depthTexture").value = composer.depthTexture;

		// 设置法线纹理（如果需要）
		if (options.useNormalPass || options.normalTexture) {

			if (options.useNormalPass) {

				this.normalPass = new NormalPass(scene, camera);

			}
			const normalTexture = options.normalTexture || this.normalPass.texture;
			this.aoPass.fullscreenMaterial.uniforms.normalTexture.value = normalTexture;
			this.aoPass.fullscreenMaterial.defines.useNormalTexture = "";

		}

		// 创建降噪通道
		this.poissionDenoisePass = new PoissionDenoisePass(camera, this.aoPass.texture, composer.depthTexture);

		// 检查降噪通道是否正确初始化
		if (this.poissionDenoisePass) {

			if (!this.poissionDenoisePass.renderTarget) {

				// 强制设置初始尺寸，以确保渲染目标被创建
				const initialWidth = 1;
				const initialHeight = 1;
				try {

					this.poissionDenoisePass.setSize(initialWidth, initialHeight);

				} catch (error) {

					console.error("初始化PoissionDenoisePass渲染目标失败:", error);

				}

			}

		} else {

			console.error("降噪通道(PoissionDenoisePass)创建失败");

		}

		// 使选项响应式
		this.makeOptionsReactive(options);

		// 初始化选择对象图层
		this.initializeSelectionLayer();

	}

	// 初始化Selection对象，移除图层依赖
	initializeSelectionLayer() {

		if (!this._ignoreSelection) { return; }

		// 确保Selection有正确的方法
		if (!this._ignoreSelection.add && typeof this._ignoreSelection.add !== "function") {

			console.warn("Selection对象缺少add方法，可能无法正常添加对象");

		}

		// 打印一些调试信息
		const itemCount = this.getSelectionItems().length;

		// 如果选择为空，打印警告
		if (itemCount === 0) {


		}

	}

	// 创建渲染目标
	createRenderTargets() {

		// 创建AO专用渲染目标，确保包含深度纹理
		this.renderTargetAO = new WebGLRenderTarget(1, 1, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
			depthBuffer: true,
			depthTexture: new DepthTexture() // 关键：添加深度纹理
		});
		this.renderTargetAO.texture.name = "AO.Target";
		this.renderTargetAO.depthTexture.name = "AO.Depth";

	}

	makeOptionsReactive(options) {

		for (const key of Object.keys(options)) {

			Object.defineProperty(this, key, {
				get() {

					// 为ignoreSelection属性提供特殊处理
					if (key === "ignoreSelection") {

						return this._ignoreSelection;

					}
					return options[key];

				},

				set(value) {

					if (value === null || value === undefined) { return; }
					options[key] = value;

					switch (key) {

						case "spp":
							this.aoPass.fullscreenMaterial.defines.spp = value.toFixed(0);
							this.aoPass.fullscreenMaterial.needsUpdate = true;
							break;

						case "distance":
							this.aoPass.fullscreenMaterial.uniforms.aoDistance.value = value;
							break;

						case "resolutionScale":
							this.setSize(this.lastSize.width, this.lastSize.height);
							break;

						case "power":
							this.uniforms.get("power").value = value;
							break;

						case "color":
							this.uniforms.get("color").value.copy(new Color(value));
							break;

						case "brightnessThreshold":
							this.uniforms.get("brightnessThreshold").value = value;
							break;

						case "debugMode":
							this.uniforms.get("debugMode").value = value;
							break;

						// 处理closeAutoUpdate变化
						case "closeAutoUpdate":
							// 不再需要处理enableEffect
							break;

						case "ignoreSelection":
							// 更新Selection对象，但使用私有变量避免递归
							this._ignoreSelection = value || new Selection();
							break;

						case "highlightValue":
							// 更新高亮值
							break;

						// 降噪参数
						case "iterations":
						case "radius":
						case "rings":
						case "samples":
							this.poissionDenoisePass[key] = value;
							break;

						case "lumaPhi":
						case "depthPhi":
						case "normalPhi":
							this.poissionDenoisePass.fullscreenMaterial.uniforms[key].value = Math.max(value, 0.0001);
							break;

						default:
							if (key in this.aoPass.fullscreenMaterial.uniforms) {

								this.aoPass.fullscreenMaterial.uniforms[key].value = value;

							}

					}

				},

				configurable: true
			});

			// 应用初始值
			this[key] = options[key];

		}

	}

	setSize(width, height) {

		if (width === undefined || height === undefined) { return; }

		if (width === this.lastSize.width && height === this.lastSize.height && this.resolutionScale === this.lastSize.resolutionScale) {

			return;

		}

		// 更新法线通道尺寸
		if (this.normalPass) {

			this.normalPass.setSize(width, height);

		}

		// 更新AO通道尺寸
		if (this.aoPass) {

			this.aoPass.setSize(width * this.resolutionScale, height * this.resolutionScale);

		}

		// 更新遮罩渲染目标尺寸
		if (this.renderTargetMask) {

			this.renderTargetMask.setSize(width * this.resolutionScale, height * this.resolutionScale);

		}

		// 更新降噪通道尺寸
		if (this.poissionDenoisePass) {

			try {

				this.poissionDenoisePass.setSize(width, height);
				if (!this.poissionDenoisePass.renderTarget) {


				}

			} catch (error) {


			}

		}

		// 更新渲染目标尺寸
		if (this.renderTargetAO) {

			this.renderTargetAO.setSize(width * this.resolutionScale, height * this.resolutionScale);

		}

		// 保存新尺寸
		this.lastSize = {
			width,
			height,
			resolutionScale: this.resolutionScale
		};

	}

	// 获取Selection中的对象
	getSelectionItems() {

		if (!this._ignoreSelection) { return []; }

		// 检查各种可能的访问方式
		if (Array.isArray(this._ignoreSelection.items)) {

			return this._ignoreSelection.items;

		}

		if (Array.isArray(this._ignoreSelection.objects)) {

			return this._ignoreSelection.objects;

		}

		if (typeof this._ignoreSelection.getItems === "function") {

			return this._ignoreSelection.getItems();

		}

		if (typeof this._ignoreSelection.getSelection === "function") {

			return this._ignoreSelection.getSelection();

		}

		// 如果Selection是一个可迭代对象
		if (typeof this._ignoreSelection[Symbol.iterator] === "function") {

			return Array.from(this._ignoreSelection);

		}

		console.warn("无法确定Selection API的使用方式");
		return [];

	}

	// 准备场景，设置对象图层
	prepareScene() {

		// 存储原始材质和发光值
		this.originalMaterials = new Map();

		// 创建用于标记忽略对象的高亮材质（如果还未创建）
		if (!this.ignoreMaterial) {

			this.ignoreMaterial = {
				originalMaterialEnabled: true,
				emissive: new Color(1000, 1000, 1000) // 超亮颜色，便于在着色器中识别
			};

		}

		// 获取要忽略的对象列表
		const selectionItems = this.getSelectionItems();

		// 为忽略列表中的对象应用特殊材质或标记
		selectionItems.forEach(object => {

			if (object && object.isMesh) {

				// 保存原始材质
				this.originalMaterials.set(object.uuid, {
					material: object.material,
					emissive: object.material.emissive ? object.material.emissive.clone() : null
				});

				// 设置超高亮度，但保持原始材质外观
				if (Array.isArray(object.material)) {

					// 处理多材质对象
					object.material.forEach(mat => {

						if (mat.emissive) {

							// 临时保存原始发光值并设置极高亮度
							mat._originalEmissive = mat.emissive.clone();
							// 使用更高的值确保在所有情况下都被识别
							mat.emissive.set(2000, 2000, 2000);

						}

					});

				} else if (object.material.emissive) {

					// 单材质对象
					object.material._originalEmissive = object.material.emissive.clone();
					// 使用更高的值确保在所有情况下都被识别
					object.material.emissive.set(2000, 2000, 2000);

				}

			}

		});

	}

	// 恢复场景原始状态
	restoreScene() {

		// 恢复原始材质
		if (this.originalMaterials) {

			for (const [uuid, data] of this.originalMaterials.entries()) {

				const object = this.scene.getObjectByProperty("uuid", uuid);
				if (object) {

					// 恢复发光值
					if (Array.isArray(object.material)) {

						// 处理多材质对象
						object.material.forEach(mat => {

							if (mat._originalEmissive) {

								mat.emissive.copy(mat._originalEmissive);
								delete mat._originalEmissive;

							}

						});

					} else if (object.material._originalEmissive) {

						// 单材质对象
						object.material.emissive.copy(object.material._originalEmissive);
						delete object.material._originalEmissive;

					}

				}

			}
			this.originalMaterials.clear();

		}

	}

	update(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {

		// 准备场景 - 设置高亮对象等
		this.prepareScene();
		if (!this.aoPass.fullscreenMaterial.uniforms.inputBuffer) {

			this.aoPass.fullscreenMaterial.uniforms.inputBuffer = {
				value: null
			};

		}
		this.aoPass.fullscreenMaterial.uniforms.inputBuffer.value = inputBuffer.texture;
		// 执行渲染前回调
		this.options?.renderBefore?.(this.scene);

		// 检查是否使用TRAA动画噪声
		const hasTRAA = this.composer.passes.some(pass => {

			const effects = pass.effects;
			return pass.enabled && !pass.skipRendering &&
				effects && effects.some(effect => effect instanceof TRAAEffect);

		});

		// 设置动画噪声
		this.aoPass.fullscreenMaterial.needsUpdate = true;
		if (hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {

			this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
			this.aoPass.fullscreenMaterial.needsUpdate = true;

		} else if (!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {

			delete this.aoPass.fullscreenMaterial.defines.animatedNoise;

		}

		// 强制清理所有渲染目标
		this.clearAllRenderTargets(renderer);

		// 保存当前渲染目标以便恢复
		const currentRenderTarget = renderer.getRenderTarget();

		// 保存场景背景和相机层
		const background = this.scene.background;
		const mask = this.camera.layers.mask;

		// 暂时移除背景
		this.scene.background = null;

		// 获取选中对象
		const selection = this._ignoreSelection;

		// 确保DepthComparisonMaterial正确设置
		const depthMaterial = this.maskPass.overrideMaterial;
		if (depthMaterial) {

			// 设置深度比较模式为"大于等于"，以正确过滤掉背后的物体
			depthMaterial.mode = 0; // 0 = SMALLER, 1 = BIGGER, 2 = EQUAL, 3 = SMALLER_EQUAL, 4 = BIGGER_EQUAL
			// 设置深度偏移，以微调深度比较结果
			depthMaterial.depthBias = 0.001;
			// 确保更新标识生效
			depthMaterial.needsUpdate = true;

		}

		// 渲染深度
		selection.setVisible(false); // 隐藏要忽略的对象
		this.depthPass.render(renderer);
		selection.setVisible(true); // 恢复被忽略对象的可见性

		// 设置相机仅渲染选中图层
		this.camera.layers.set(selection.layer);

		// 渲染遮罩
		this.maskPass.render(renderer, this.renderTargetMask);

		// 恢复相机层和场景背景
		this.camera.layers.mask = mask;
		this.scene.background = background;

		// 步骤2: 使用遮罩和深度信息渲染AO效果
		// this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = this.composer.depthTexture;

		this.aoPass.fullscreenMaterial.uniforms.maskTexture = {
			value: this.renderTargetMask.texture
		};

		// 渲染AO效果
		this.aoPass.render(renderer);

		// 对AO结果进行降噪
		this.poissionDenoisePass.render(renderer);

		// 步骤3: 设置最终AO纹理
		this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
		this.uniforms.get("inputBuffer").value = inputBuffer.texture;

		// 恢复原始渲染目标
		renderer.setRenderTarget(currentRenderTarget);

		// 恢复场景状态
		this.restoreScene();

	}

	// 清理所有渲染目标
	clearAllRenderTargets(renderer) {

		// 保存当前渲染目标
		const currentRenderTarget = renderer.getRenderTarget();

		try {

			// 清理所有已定义的渲染目标
			const targets = [
				this.renderTargetAO,
				this.aoPass?.renderTarget,
				this.poissionDenoisePass?.renderTarget
			];

			// 遍历所有渲染目标并清理
			for (const target of targets) {

				if (target) {

					renderer.setRenderTarget(target);
					renderer.clear(true, true, true);

				}

			}

		} catch (error) {

			console.error("清理渲染目标时出错:", error);

		} finally {

			// 确保无论如何都恢复原来的渲染目标
			renderer.setRenderTarget(currentRenderTarget);

		}

	}

	// 存储原始发光值的方法
	storeOriginalEmissive(object) {

		if (!this.originalEmissives.has(object.uuid)) {

			if (object.material) {

				if (object.material.emissive) {

					this.originalEmissives.set(object.uuid, object.material.emissive.clone());

				} else if (Array.isArray(object.material)) {

					const emissives = [];
					object.material.forEach(mat => {

						if (mat.emissive) {

							emissives.push(mat.emissive.clone());

						} else {

							emissives.push(null);

						}

					});
					this.originalEmissives.set(object.uuid, emissives);

				}

			}

		}

	}

	// 设置对象高亮的方法
	setObjectHighlight(object, highlight) {

		// 确保存储了原始发光值
		this.storeOriginalEmissive(object);

		if (object.material) {

			if (object.material.emissive) {

				if (highlight) {

					object.material.emissive.set(
						this.highlightValue,
						this.highlightValue,
						this.highlightValue
					);

				} else {

					const originalEmissive = this.originalEmissives.get(object.uuid);
					if (originalEmissive) {

						object.material.emissive.copy(originalEmissive);

					}

				}

			} else if (Array.isArray(object.material)) {

				const originalEmissives = this.originalEmissives.get(object.uuid);
				object.material.forEach((mat, index) => {

					if (mat.emissive) {

						if (highlight) {

							mat.emissive.set(
								this.highlightValue,
								this.highlightValue,
								this.highlightValue
							);

						} else if (originalEmissives && originalEmissives[index]) {

							mat.emissive.copy(originalEmissives[index]);

						}

					}

				});

			}

		}

	}

	// 添加一个对象到忽略列表
	addToIgnoreList(object) {

		if (!object) { return; }

		if (this._ignoreSelection && typeof this._ignoreSelection.add === "function") {

			this._ignoreSelection.add(object);
			console.log(`已添加对象到AO忽略列表: ${object.name || object.uuid}`);

			// 标记需要更新
			this.setChanged();

		} else {

			console.warn("无法添加对象到忽略列表，Selection对象不可用");

		}

	}

	// 从忽略列表中移除对象
	removeFromIgnoreList(object) {

		if (!object) { return; }

		if (this._ignoreSelection && typeof this._ignoreSelection.delete === "function") {

			this._ignoreSelection.delete(object);
			console.log(`已从AO忽略列表移除对象: ${object.name || object.uuid}`);

			// 标记需要更新
			this.setChanged();

		} else {

			console.warn("无法从忽略列表移除对象，Selection对象不可用");

		}

	}

	// 清空忽略列表
	clearIgnoreList() {

		if (this._ignoreSelection && typeof this._ignoreSelection.clear === "function") {

			this._ignoreSelection.clear();
			console.log("已清空AO忽略列表");

			// 标记需要更新
			this.setChanged();

		} else {

			console.warn("无法清空忽略列表，Selection对象不可用");

		}

	}

	// 触发效果更新
	forceUpdate() {

		// 标记需要更新
		this.setChanged();

		// 如果在composer中，尝试触发一次渲染
		if (this.composer && typeof this.composer.render === "function") {

			// 请求一次额外的渲染，清除残留色块
			requestAnimationFrame(() => {

				this.composer.render();

			});

		}

	}

	// 设置调试模式的方法
	setDebugMode(mode) {

		if (mode >= 0 && mode <= 7) {

			this.debugMode = mode;
			console.log(`AO调试模式已切换到: ${this.getDebugModeName(mode)}`);

		} else {

			console.warn(`无效的调试模式: ${mode}，有效范围: 0-7`);

		}

	}

	// 获取调试模式名称
	getDebugModeName(mode) {

		const modes = [
			"正常",
			"亮度",
			"AO强度",
			"AO值",
			"遮罩",
			"深度(灰度)",
			"深度(彩色)",
			"遮罩和深度对比"
		];
		return modes[mode] || "未知";

	}

	// 循环切换调试模式
	cycleDebugMode() {

		const newMode = (this.debugMode + 1) % 8; // 8是调试模式总数
		this.setDebugMode(newMode);
		return newMode;

	}

	// 显示所有调试模式
	listDebugModes() {

		console.log("可用的AO调试模式:");
		for (let i = 0; i < 8; i++) {

			console.log(`${i}: ${this.getDebugModeName(i)}`);

		}

	}

}
