import { TemporalReprojectPass } from "../libs/realism-effects/src/temporal-reproject/TemporalReprojectPass";
import { VelocityDepthNormalPass } from "../libs/realism-effects/src/temporal-reproject/pass/VelocityDepthNormalPass";
import { DenoiserComposePass } from "../libs/realism-effects/src/denoise/pass/DenoiserComposePass";
import { PoissonDenoisePass } from "../libs/realism-effects/src/denoise/pass/PoissonDenoisePass";

const defaultDenoiserOptions = {
	denoiseMode: "full", // can be "full" | "full_temporal" | "denoised" | "temporal"
	inputType: "diffuseSpecular", // can be "diffuseSpecular" | "diffuse" | "specular"
	gBufferPass: null,
	velocityDepthNormalPass: null,
	brightnessCompensation: 1.5 // 增加亮度补偿选项
};

/**
 * 自定义降噪器 - 修改原始降噪处理以避免黑点问题
 * 主要通过修改降噪强度和亮度补偿来实现
 */
export class CustomDenoiser {

	constructor(scene, camera, texture, options = defaultDenoiserOptions) {

		options = { ...defaultDenoiserOptions, ...options };
		this.options = options;

		// 存储场景和相机引用
		this._scene = scene;
		this._camera = camera;

		// 使用提供的速度深度法线通道或创建新的
		this.velocityDepthNormalPass = options.velocityDepthNormalPass ?? new VelocityDepthNormalPass(scene, camera);
		this.isOwnVelocityDepthNormalPass = !options.velocityDepthNormalPass;

		const textureCount = options.inputType === "diffuseSpecular" ? 2 : 1;

		// 设置时间重投影通道
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
				neighborhoodClampRadius: 1, // 减小半径，减少黑点产生
				neighborhoodClampIntensity: 0.3, // 降低强度，减少黑点
				...options
			}
		);

		const textures = this.temporalReprojectPass.renderTarget.texture.slice(0, textureCount);

		// 设置自定义降噪通道 - 修改处理参数
		if(this.options.denoiseMode === "full" || this.options.denoiseMode === "denoised") {

			// 自定义泊松降噪通道参数
			const customDenoiseOptions = {
				...options,
				phi: options.phi * 0.7, // 减小phi值
				lumaPhi: options.lumaPhi * 0.8, // 减小亮度phi值
				depthPhi: options.depthPhi * 0.9, // 调整深度phi值
				normalPhi: options.normalPhi * 1.2 // 增大法线phi值以保留更多细节
			};

			this.denoisePass = new PoissonDenoisePass(camera, textures, customDenoiseOptions);
			this.denoisePass.setGBufferPass(options.gBufferPass ?? this.velocityDepthNormalPass);

			// 覆盖累积纹理
			this.temporalReprojectPass.overrideAccumulatedTextures = this.denoisePass.renderTargetB.texture;

		}

		const composerInputTextures = this.denoisePass?.texture ?? textures;

		// 设置自定义合成通道，同时设置亮度补偿
		if(options.denoiseMode.startsWith("full")) {

			this.denoiserComposePass = new DenoiserComposePass(
				camera,
				composerInputTextures,
				options.gBufferPass.texture,
				options.gBufferPass.renderTarget.depthTexture,
				{
					...options,
					brightnessCompensation: options.brightnessCompensation || 1.5 // 应用亮度补偿
				}
			);

		}

		console.log("创建了自定义降噪器，降噪参数已调整以避免黑点");

	}

	/**
     * 重置降噪器状态
     */
	reset() {

		this.temporalReprojectPass?.reset();

	}

	/**
     * 调整亮度补偿系数
     * @param {number} value - 新的亮度补偿系数
     */
	setBrightnessCompensation(value) {

		this.options.brightnessCompensation = value;
		// 如果需要，可以在这里更新其他相关参数

	}

	/**
     * 渲染降噪效果
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     */
	render(renderer, inputBuffer) {

		// 1. 时间重投影处理
		this.temporalReprojectPass.render(renderer);

		// 2. 应用自定义降噪过程 - 采用温和的降噪处理
		if(this.denoisePass) {

			this.denoisePass.render(renderer);

		}

		// 3. 应用自定义合成 - 包含亮度补偿
		if(this.denoiserComposePass) {

			this.denoiserComposePass.render(renderer);

		}

	}

	/**
     * 释放资源
     */
	dispose() {

		this.denoisePass?.dispose();
		this.temporalReprojectPass?.dispose();
		this.denoiserComposePass?.dispose();

		if(this.isOwnVelocityDepthNormalPass) {

			this.velocityDepthNormalPass.dispose();

		}

	}

	/**
     * 获取输出纹理
     */
	get texture() {

		return this.denoiserComposePass?.renderTarget.texture ??
            this.denoisePass?.renderTarget.texture[0] ??
            this.temporalReprojectPass.renderTarget.texture[0];

	}

	/**
     * 设置渲染尺寸
     * @param {number} width - 宽度
     * @param {number} height - 高度
     */
	setSize(width, height) {

		this.temporalReprojectPass?.setSize(width, height);
		this.denoisePass?.setSize(width, height);
		this.denoiserComposePass?.setSize(width, height);

	}

}
