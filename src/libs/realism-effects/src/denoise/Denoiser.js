import { TemporalReprojectPass } from "../temporal-reproject/TemporalReprojectPass"
import { VelocityDepthNormalPass } from "../temporal-reproject/pass/VelocityDepthNormalPass"
import { DenoiserComposePass } from "./pass/DenoiserComposePass"
import { PoissonDenoisePass } from "./pass/PoissonDenoisePass"
import { GaussianBilateralDenoisePass } from "./pass/GaussianBilateralDenoisePass"

const defaultDenosierOptions = {
	denoiseMode: "full", // can be "full" | "full_temporal" | "denoised" | "temporal"
	inputType: "diffuseSpecular", // can be "diffuseSpecular" | "diffuse" | "specular"
	gBufferPass: null,
	velocityDepthNormalPass: null,
	denoiseAlgorithm: "poisson", // 可以是 "poisson" 或 "gaussian-bilateral"
	// 为高斯双边滤波器提供默认参数
	sigmaSpace: 2.0,
	sigmaRange: 0.05,
	// 允许双边滤波进行更多迭代
	denoiseIterations: 2
}

// a spatio-temporal denoiser
// temporal: temporal reprojection to reproject previous frames
// spatial: poisson denoiser to denoise the current frame recurrently
export default class Denoiser {
	constructor(scene, camera, texture, options = defaultDenosierOptions) {
		options = { ...defaultDenosierOptions, ...options }
		this.options = options

		this.velocityDepthNormalPass = options.velocityDepthNormalPass ?? new VelocityDepthNormalPass(scene, camera)
		this.isOwnVelocityDepthNormalPass = !options.velocityDepthNormalPass

		const textureCount = options.inputType === "diffuseSpecular" ? 2 : 1

		this.temporalReprojectPass = new TemporalReprojectPass(
			scene,
			camera,
			this.velocityDepthNormalPass,
			texture,
			textureCount,
			{
				fullAccumulate: true,

				logTransform: true,
				copyTextures: !options.denoise,
				reprojectSpecular: [false, true],
				neighborhoodClamp: [true, true],
				neighborhoodClampRadius: 2,
				neighborhoodClampIntensity: 0.5,
				...options
			}
		)

		const textures = this.temporalReprojectPass.renderTarget.texture.slice(0, textureCount)

		if (this.options.denoiseMode === "full" || this.options.denoiseMode === "denoised") {
			// 确保算法选择是有效的
			if (options.denoiseAlgorithm !== "poisson" && options.denoiseAlgorithm !== "gaussian-bilateral") {
				console.warn(`未知的降噪算法: ${options.denoiseAlgorithm}，将使用默认的泊松降噪`);
				options.denoiseAlgorithm = "poisson";
			}

			// 根据选择的降噪算法创建相应的降噪Pass
			if (options.denoiseAlgorithm === "gaussian-bilateral") {
				console.log("使用高斯双边滤波器进行降噪");

				// 构建特定于高斯双边滤波器的选项
				const gaussianOptions = {
					...options,
					// 确保高斯双边滤波器参数存在且有合理的值
					sigmaSpace: options.sigmaSpace ?? 2.0,
					sigmaRange: options.sigmaRange ?? 0.05,
					radius: options.radius ?? 3.0,
					// 允许多次迭代，但限制最大值
					iterations: Math.min(options.denoiseIterations ?? 2, 3)
				};

				// 使用高斯-双边滤波器
				this.denoisePass = new GaussianBilateralDenoisePass(camera, textures, gaussianOptions);
			} else {
				// 默认使用泊松降噪
				this.denoisePass = new PoissonDenoisePass(camera, textures, options);
			}

			// 设置GBuffer
			if (options.gBufferPass) {
				this.denoisePass.setGBufferPass(options.gBufferPass);
			} else if (this.velocityDepthNormalPass) {
				this.denoisePass.setGBufferPass(this.velocityDepthNormalPass);
			}

			// 确保纹理正确关联
			if (this.temporalReprojectPass && this.temporalReprojectPass.renderTarget &&
				this.temporalReprojectPass.renderTarget.texture &&
				this.denoisePass && this.denoisePass.renderTargetB &&
				this.denoisePass.renderTargetB.texture) {
				this.temporalReprojectPass.overrideAccumulatedTextures = this.denoisePass.renderTargetB.texture;
			}
		}

		const composerInputTextures = this.denoisePass?.texture ?? textures

		if (options.denoiseMode.startsWith("full")) {
			this.denoiserComposePass = new DenoiserComposePass(
				camera,
				composerInputTextures,
				options.gBufferPass.texture,
				options.gBufferPass.renderTarget.depthTexture,
				options
			)
		}

		// 存储场景和相机引用，用于重建降噪器
		this._scene = scene;
		this._camera = camera;
		this._texture = texture;

		// 跟踪当前纹理，防止重复更新
		this._currentTextures = composerInputTextures;
		this._texturesNeedUpdate = false;
	}

	/**
	 * 获取使用的降噪算法名称
	 * @returns {string} "poisson" 或 "gaussian-bilateral"
	 */
	get denoiseAlgorithm() {
		return this.options.denoiseAlgorithm;
	}

	/**
	 * 设置降噪算法
	 * @param {string} algorithm - "poisson" 或 "gaussian-bilateral"
	 */
	set denoiseAlgorithm(algorithm) {
		if (algorithm !== "poisson" && algorithm !== "gaussian-bilateral") {
			console.warn(`不支持的降噪算法: ${algorithm}，将使用默认的泊松降噪`);
			algorithm = "poisson";
		}

		// 如果算法没有变化，不做任何事
		if (this.options.denoiseAlgorithm === algorithm) return;

		// 更新选项
		this.options.denoiseAlgorithm = algorithm;

		// 如果已经有了denoisePass，需要重建它
		if (this.denoisePass) {
			const oldDenoisePass = this.denoisePass;
			const textures = this.temporalReprojectPass.renderTarget.texture.slice(
				0,
				this.options.inputType === "diffuseSpecular" ? 2 : 1
			);

			// 保存原始尺寸
			const width = this.denoisePass.renderTargetA.width;
			const height = this.denoisePass.renderTargetA.height;

			// 使用当前设置创建新的降噪Pass
			if (algorithm === "gaussian-bilateral") {
				console.log("切换到高斯双边滤波器");

				// 构建特定于高斯双边滤波器的选项
				const gaussianOptions = {
					...this.options,
					// 确保高斯双边滤波器参数存在且有合理的值
					sigmaSpace: this.options.sigmaSpace ?? 2.0,
					sigmaRange: this.options.sigmaRange ?? 0.05,
					radius: this.options.radius ?? 3.0,
					// 允许更多迭代
					iterations: Math.min(this.options.denoiseIterations ?? 2, 3)
				};

				this.denoisePass = new GaussianBilateralDenoisePass(
					this._camera,
					textures,
					gaussianOptions
				);
			} else {
				console.log("切换到泊松降噪器");
				this.denoisePass = new PoissonDenoisePass(
					this._camera,
					textures,
					this.options
				);
			}

			// 设置GBuffer
			if (this.options.gBufferPass) {
				this.denoisePass.setGBufferPass(this.options.gBufferPass);
			} else if (this.velocityDepthNormalPass) {
				this.denoisePass.setGBufferPass(this.velocityDepthNormalPass);
			}

			// 设置大小
			this.denoisePass.setSize(width, height);

			// 更新在temporalReprojectPass中使用的累积纹理
			if (this.temporalReprojectPass) {
				this.temporalReprojectPass.overrideAccumulatedTextures = this.denoisePass.renderTargetB.texture;
			}

			// 如果有denoiserComposePass，更新它的输入纹理
			if (this.denoiserComposePass) {
				try {
					// 获取新的降噪结果纹理
					const newTextures = this.denoisePass.texture;

					// 更新当前纹理引用
					this._currentTextures = newTextures;
					this._texturesNeedUpdate = true;

					// 如果存在updateTextures方法，使用它
					if (typeof this.denoiserComposePass.updateTextures === 'function') {
						this.denoiserComposePass.updateTextures(newTextures);
						this._texturesNeedUpdate = false; // 已更新，不需要再次更新
					} else {
						// 直接更新纹理引用
						const uniforms = this.denoiserComposePass.fullscreenMaterial.uniforms;

						if (this.options.inputType === "diffuseSpecular" && Array.isArray(newTextures)) {
							if (uniforms.diffuseGiTexture) uniforms.diffuseGiTexture.value = newTextures[0];
							if (uniforms.specularGiTexture) uniforms.specularGiTexture.value = newTextures[1];
						} else if (this.options.inputType === "diffuse") {
							if (uniforms.diffuseGiTexture) uniforms.diffuseGiTexture.value = Array.isArray(newTextures) ? newTextures[0] : newTextures;
						} else if (this.options.inputType === "specular") {
							if (uniforms.specularGiTexture) uniforms.specularGiTexture.value = Array.isArray(newTextures) ? newTextures[0] : newTextures;
						}

						this._texturesNeedUpdate = false; // 已直接更新，不需要再次更新
					}

					console.log("已更新DenoiserComposePass的输入纹理");
				} catch (error) {
					console.error("更新DenoiserComposePass的输入纹理时出错:", error);
				}
			}

			// 处理旧的降噪Pass
			oldDenoisePass.dispose();
		}

		// 重置以应用更改
		this.reset();
	}

	get texture() {
		if (this.options.denoiseMode === "denoised") return this.denoisePass.texture
		else if (this.options.denoiseMode === "temporal") return this.temporalReprojectPass.texture
		else if (this.options.denoiseMode.startsWith("full"))
			return this.denoiserComposePass.renderTarget.texture

		return this.temporalReprojectPass.texture
	}

	reset() {
		this.temporalReprojectPass.reset();

		// 在重置时确保DenoiserComposePass使用最新的纹理
		if (this.denoiserComposePass && this.denoisePass) {
			try {
				const newTextures = this.denoisePass.texture;

				// 检查纹理是否发生变化
				const hasChanged = this.hasTexturesChanged(newTextures);

				if (hasChanged) {
					// 更新当前纹理引用
					this._currentTextures = newTextures;
					this._texturesNeedUpdate = true;

					// 如果存在updateTextures方法，使用它
					if (typeof this.denoiserComposePass.updateTextures === 'function') {
						this.denoiserComposePass.updateTextures(newTextures);
						this._texturesNeedUpdate = false; // 已更新，不需要再次更新
					}
				}
			} catch (error) {
				console.error("在reset中更新DenoiserComposePass纹理时出错:", error);
			}
		}
	}

	// 检查纹理是否发生变化
	hasTexturesChanged(newTextures) {
		if (!this._currentTextures) return true;

		// 对象引用比较
		if (this._currentTextures === newTextures) return false;

		// 数组比较
		if (Array.isArray(this._currentTextures) && Array.isArray(newTextures)) {
			if (this._currentTextures.length !== newTextures.length) return true;

			for (let i = 0; i < this._currentTextures.length; i++) {
				if (this._currentTextures[i] !== newTextures[i]) return true;
			}

			return false;
		}

		// 不同类型，视为变化
		return true;
	}

	setSize(width, height) {
		this.velocityDepthNormalPass.setSize(width, height)
		this.temporalReprojectPass.setSize(width, height)
		this.denoisePass?.setSize(width, height)
		this.denoiserComposePass?.setSize(width, height)
	}

	dispose() {
		this.velocityDepthNormalPass.dispose()
		this.temporalReprojectPass.dispose()
		this.denoisePass?.dispose()
		this.denoiserComposePass?.dispose()
	}

	render(renderer, inputBuffer = null) {
		if (this.isOwnVelocityDepthNormalPass) this.velocityDepthNormalPass.render(renderer)
		this.temporalReprojectPass.render(renderer)

		if (this.options.inputType !== "diffuseSpecular") {
			this.denoiserComposePass?.setSceneTexture(inputBuffer.texture)
		}

		// 执行降噪
		this.denoisePass?.render(renderer)

		// 执行最终合成
		this.denoiserComposePass?.render(renderer)
	}
}
