import { SSGIEffect } from "../libs/realism-effects/src/ssgi/SSGIEffect";
import { getVisibleChildren } from "../libs/realism-effects/src/gbuffer/utils/GBufferUtils.js";
import { isChildMaterialRenderable } from "../libs/realism-effects/src/utils/SceneUtils.js";
import { createGlobalDisableIblRadianceUniform } from "../libs/realism-effects/src/ssgi/utils/Utils.js";
import { CustomDenoiser } from "./CustomDenoiser";

const globalIblRadianceDisabledUniform = createGlobalDisableIblRadianceUniform();

/**
 * 自定义SSGI效果类，用于解决黑点问题
 * 主要通过使用自定义降噪器来避免黑点产生
 */
export class CustomSSGIEffect extends SSGIEffect {

	/**
     * 构造函数
     * @param {import("postprocessing").EffectComposer} composer - 效果合成器
     * @param {THREE.Scene} scene - 场景
     * @param {THREE.Camera} camera - 相机
     * @param {Object} options - SSGI选项
     */
	constructor(composer, scene, camera, options = {}) {

		// 预处理一些选项
		options = {
			...options,
			// 调整一些默认参数以减少黑点产生
			normalPhi: options.normalPhi || 30, // 降低法线敏感度
			roughnessPhi: options.roughnessPhi || 30, // 降低粗糙度敏感度
			steps: options.steps || 20,
			refineSteps: options.refineSteps || 4
		};

		// 调用原始构造函数
		super(composer, scene, camera, options);

		// 保存亮度补偿系数
		this.brightnessCompensation = options.brightnessCompensation || 1.5;

		// 替换原始降噪器为我们的自定义版本
		// 先保存并销毁原始降噪器
		const originalDenoiser = this.denoiser;

		// 创建自定义降噪器
		this.denoiser = new CustomDenoiser(scene, camera, this.ssgiPass.texture, {
			gBufferPass: this.ssgiPass.gBufferPass,
			velocityDepthNormalPass: options.velocityDepthNormalPass,
			brightnessCompensation: this.brightnessCompensation,
			...options
		});

		// 更新输出纹理引用
		this.outputTexture = this.denoiser.texture;

		// 销毁原始降噪器，避免内存泄漏
		if(originalDenoiser) {

			originalDenoiser.dispose();

		}

		// 记录日志
		console.log("CustomSSGIEffect 已创建，使用自定义降噪器以避免黑点");

	}

	/**
     * 重写更新方法
     * @param {THREE.WebGLRenderer} renderer - 渲染器
     * @param {THREE.WebGLRenderTarget} inputBuffer - 输入缓冲区
     */
	update(renderer, inputBuffer) {

		// 1. 更新环境贴图 - 保留原功能
		this.keepEnvMapUpdated(renderer);

		// 2. 确定场景缓冲区
		const sceneBuffer = this.isUsingRenderPass ? inputBuffer : this.sceneRenderTarget;

		// 3. 处理场景中不应参与SSGI的对象
		const hideMeshes = [];

		if(!this.isUsingRenderPass) {

			const children = [];

			for(const c of getVisibleChildren(this._scene)) {

				if(c.isScene) { return; }

				c.visible = !isChildMaterialRenderable(c);
				c.visible ? hideMeshes.push(c) : children.push(c);

			}

			this.renderPass.render(renderer, this.sceneRenderTarget);

			for(const c of children) { c.visible = true; }
			for(const c of hideMeshes) { c.visible = false; }

		}

		// 4. 设置SSGI光线追踪输入并执行
		this.ssgiPass.fullscreenMaterial.uniforms.directLightTexture.value = sceneBuffer.texture;
		this.ssgiPass.render(renderer);

		// 5. 使用自定义降噪器而不是跳过降噪步骤
		this.denoiser.render(renderer, inputBuffer);

		// 6. 设置合成材质需要的纹理 - 与原始代码类似但使用自定义降噪器的输出
		this.uniforms.get("inputTexture").value = this.denoiser.texture;
		this.uniforms.get("sceneTexture").value = sceneBuffer.texture;
		this.uniforms.get("depthTexture").value = this.ssgiPass.gBufferPass.depthTexture;

		// 7. 更新雾效相关uniform (如果场景中有雾)
		if(this._scene.fog) {

			this.uniforms.get("fogColor").value = this._scene.fog.color;
			this.uniforms.get("fogNear").value = this._scene.fog.near;
			this.uniforms.get("fogFar").value = this._scene.fog.far;
			this.uniforms.get("fogDensity").value = this._scene.fog.density;

			this.uniforms.get("cameraNear").value = this._camera.near;
			this.uniforms.get("cameraFar").value = this._camera.far;

		}

		// 8. 恢复场景对象可见性
		for(const c of hideMeshes) { c.visible = true; }

		// 9. 处理IBL辐射
		globalIblRadianceDisabledUniform.value = true;

		cancelAnimationFrame(this.rAF2);
		cancelAnimationFrame(this.rAF);
		cancelAnimationFrame(this.usingRenderPassRAF);

		this.rAF = requestAnimationFrame(() => {

			this.rAF2 = requestAnimationFrame(() => {

				globalIblRadianceDisabledUniform.value = false;

			});

		});

		this.usingRenderPassRAF = requestAnimationFrame(() => {

			const wasUsingRenderPass = this.isUsingRenderPass;
			this.isUsingRenderPass = false;

			if(wasUsingRenderPass != this.isUsingRenderPass) { this.updateUsingRenderPass(); }

		});

	}

	/**
     * 重写dispose方法以确保清理自定义降噪器
     */
	dispose() {

		// 调用父类的dispose
		super.dispose();

		// 确保自定义降噪器被正确处理
		if(this.denoiser && this.denoiser instanceof CustomDenoiser) {

			this.denoiser.dispose();

		}

	}

}
