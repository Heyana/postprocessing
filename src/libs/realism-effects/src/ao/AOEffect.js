import { Effect, NormalPass } from "postprocessing";
import { Color, Uniform, WebGLRenderTarget, RGBAFormat, FloatType, NearestFilter } from "three";
import { PoissonDenoisePass } from "../denoise/pass/PoissonDenoisePass";

import ao_compose from "./shader/ao_compose.frag";
import { TRAAEffect } from "../traa/TRAAEffect";

const defaultAOOptions = {
	resolutionScale: 1,
	spp: 8,
	distance: 2,
	distancePower: 1,
	power: 2,
	bias: 40,
	thickness: 0.075,
	color: new Color("black"),
	useNormalPass: false,
	velocityDepthNormalPass: null,
	normalTexture: null,
	useExcludeMask: false,
	excludedObjects: [],
	...PoissonDenoisePass.DefaultOptions
};

class AOEffect extends Effect {

	lastSize = { width: 0, height: 0, resolutionScale: 0 };

	constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {

		super("AOEffect", ao_compose, {
			type: "FinalAOMaterial",
			uniforms: new Map([
				["inputTexture", new Uniform(null)],
				["depthTexture", new Uniform(null)],
				["power", new Uniform(0)],
				["color", new Uniform(new Color("black"))],
				["excludeMaskTexture", new Uniform(null)]
			])
		});

		this.composer = composer;
		this.aoPass = aoPass;
		this.scene = scene;
		this.camera = camera;
		options = { ...defaultAOOptions, ...options };

		// 创建排除标识渲染目标
		this.excludeMaskTarget = null;

		// set up depth texture
		if(!composer.depthTexture) { composer.createDepthTexture(); }

		this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = composer.depthTexture;
		this.uniforms.get("depthTexture").value = composer.depthTexture;

		// set up optional normal texture
		if(options.useNormalPass || options.normalTexture) {

			if(options.useNormalPass) { this.normalPass = new NormalPass(scene, camera); }

			const normalTexture = options.normalTexture ?? this.normalPass.texture;

			this.aoPass.fullscreenMaterial.uniforms.normalTexture.value = normalTexture;
			this.aoPass.fullscreenMaterial.defines.useNormalTexture = "";

		}

		this.PoissonDenoisePass = new PoissonDenoisePass(camera, this.aoPass.texture, composer.depthTexture, {
			normalInRgb: true
		});

		this.makeOptionsReactive(options);

		// 初始化排除标识相关设置
		if(options.useExcludeMask) {

			this.initExcludeMask();

		}

	}

	initExcludeMask() {

		// 启用排除标识功能
		this.defines = this.defines || new Map();
		this.defines.set("USE_EXCLUDE_MASK", "1");

		// 创建用于渲染排除对象的渲染目标
		const width = this.lastSize.width || 512;
		const height = this.lastSize.height || 512;
		this.excludeMaskTarget = new WebGLRenderTarget(width, height, {
			format: RGBAFormat,
			type: FloatType,
			minFilter: NearestFilter,
			magFilter: NearestFilter
		});

		// 设置排除标识纹理
		this.uniforms.get("excludeMaskTexture").value = this.excludeMaskTarget.texture;

	}

	// 设置要排除的对象
	setExcludedObjects(objects) {

		this.excludedObjects = Array.isArray(objects) ? objects : [objects];

		// 如果没有初始化过排除功能，则初始化
		if(this.useExcludeMask && !this.excludeMaskTarget) {

			this.initExcludeMask();

		}

	}

	// 渲染排除标识到纹理
	renderExcludeMask(renderer) {

		if(!this.excludeMaskTarget || !this.useExcludeMask || !this.excludedObjects.length) { return; }

		// 保存当前渲染状态
		const currentRenderTarget = renderer.getRenderTarget();
		const currentAutoClear = renderer.autoClear;

		// 准备渲染排除标识
		renderer.setRenderTarget(this.excludeMaskTarget);
		renderer.autoClear = true;
		renderer.clear();

		// 临时存储对象的可见性状态
		const visibilityStates = new Map();

		// 隐藏所有对象
		this.scene.traverse(object => {

			if(object.isMesh) {

				visibilityStates.set(object, object.visible);
				object.visible = false;

			}

		});

		// 仅显示需要排除的对象
		for(const object of this.excludedObjects) {

			if(object) {

				object.visible = true;
				// 如果是组，则显示其中所有对象
				if(object.isGroup) {

					object.traverse(child => {

						if(child.isMesh) {

							child.visible = true;

						}

					});

				}

			}

		}

		// 渲染排除对象到标识纹理
		renderer.render(this.scene, this.camera);

		// 恢复对象可见性
		this.scene.traverse(object => {

			if(object.isMesh && visibilityStates.has(object)) {

				object.visible = visibilityStates.get(object);

			}

		});

		// 恢复渲染状态
		renderer.setRenderTarget(currentRenderTarget);
		renderer.autoClear = currentAutoClear;

	}

	makeOptionsReactive(options) {

		for(const key of Object.keys(options)) {

			Object.defineProperty(this, key, {
				get() {

					return options[key];

				},
				set(value) {

					if(value === null || value === undefined) { return; }

					options[key] = value;

					switch(key) {

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

						case "useExcludeMask":
							if(value) {

								this.defines = this.defines || new Map();
								this.defines.set("USE_EXCLUDE_MASK", "1");
								if(!this.excludeMaskTarget) {

									this.initExcludeMask();

								}

							} else {

								if(this.defines) {

									this.defines.delete("USE_EXCLUDE_MASK");

								}

							}
							this.setSize(this.lastSize.width, this.lastSize.height);
							break;

						// denoiser
						case "iterations":
						case "radius":
						case "rings":
						case "samples":
							this.PoissonDenoisePass[key] = value;
							break;

						case "lumaPhi":
						case "depthPhi":
						case "normalPhi":
							this.PoissonDenoisePass.fullscreenMaterial.uniforms[key].value = Math.max(value, 0.0001);
							break;

						default:
							if(key in this.aoPass.fullscreenMaterial.uniforms) {

								this.aoPass.fullscreenMaterial.uniforms[key].value = value;

							}

					}

				},
				configurable: true
			});

			// apply all uniforms and defines
			this[key] = options[key];

		}

	}

	setSize(width, height) {

		if(width === undefined || height === undefined) { return; }
		if(
			width === this.lastSize.width &&
			height === this.lastSize.height &&
			this.resolutionScale === this.lastSize.resolutionScale
		) {

			return;

		}

		this.normalPass?.setSize(width, height);
		this.aoPass.setSize(width * this.resolutionScale, height * this.resolutionScale);

		this.PoissonDenoisePass.setSize(width, height);

		// 调整排除标识渲染目标大小
		if(this.excludeMaskTarget) {

			this.excludeMaskTarget.setSize(width, height);

		}

		this.lastSize = {
			width,
			height,
			resolutionScale: this.resolutionScale
		};

	}

	get texture() {

		if(this.iterations > 0) {

			return this.PoissonDenoisePass.texture;

		}

		return this.aoPass.texture;

	}

	update(renderer) {

		// 如果启用了排除标识功能，先渲染排除标识
		if(this.useExcludeMask && this.excludeMaskTarget) {

			this.renderExcludeMask(renderer);

		}

		// check if TRAA is being used so we can animate the noise
		const hasTRAA = this.composer.passes.some(pass => {

			return pass.enabled && !pass.skipRendering && pass.effects?.some(effect => effect instanceof TRAAEffect);

		});

		// set animated noise depending on TRAA
		if(hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {

			this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
			this.aoPass.fullscreenMaterial.needsUpdate = true;

		} else if(!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {

			delete this.aoPass.fullscreenMaterial.defines.animatedNoise;
			this.aoPass.fullscreenMaterial.needsUpdate = true;

		}

		this.uniforms.get("inputTexture").value = this.texture;

		this.normalPass?.render(renderer);
		this.aoPass.render(renderer);

		this.PoissonDenoisePass.render(renderer);

	}

}

AOEffect.DefaultOptions = defaultAOOptions;

export { AOEffect };
