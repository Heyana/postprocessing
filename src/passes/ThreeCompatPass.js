import {
	BasicDepthPacking,
	Camera,
	Material,
	Scene,
	WebGLRenderTarget
} from "three";

import { Pass } from "./Pass.js";

/**
 * 一个兼容层Pass，用于包装Three.js原生的Pass使其能在当前项目的EffectComposer中工作
 *
 * @implements {Initializable}
 * @implements {Resizable}
 * @implements {Disposable}
 */
export class ThreeCompatPass extends Pass {

	/**
     * 构造一个新的Three.js Pass兼容层
     *
     * @param {Object} threePass - Three.js原生的Pass实例
     * @param {String} [name="ThreeCompatPass"] - Pass的名称
     */
	constructor(threePass, name = "ThreeCompatPass") {

		super(name);

		/**
         * 被包装的Three.js原生Pass
         *
         * @type {Object}
         * @private
         */
		this.threePass = threePass;

		/**
         * 从原始Three.js Pass中继承一些关键属性
         */
		this.enabled = threePass.enabled;
		this.needsSwap = threePass.needsSwap;
		this.renderToScreen = true;

	}

	/**
     * 设置渲染到屏幕的标志
     *
     * @type {Boolean}
     */
	set renderToScreen(value) {

		super.renderToScreen = value;
		if(this.threePass) {

			this.threePass.renderToScreen = value;

		}

	}

	get renderToScreen() {

		return super.renderToScreen;

	}

	/**
     * 设置尺寸
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		if(this.threePass && typeof this.threePass.setSize === "function") {

			this.threePass.setSize(width, height);

		}

	}

	/**
     * 初始化Pass
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Boolean} alpha - 渲染器是否使用alpha通道
     * @param {Number} frameBufferType - 主帧缓冲区的类型
     */
	initialize(renderer, alpha, frameBufferType) {

		// Three.js的原生Pass没有initialize方法，只需要确保renderer可用
		if(this.threePass) {

			// 一些Three.js Pass可能需要renderer，尝试注入
			if(typeof this.threePass.setRenderer === "function") {

				this.threePass.setRenderer(renderer);

			}

		}

	}

	/**
     * 设置深度纹理
     *
     * @param {Texture} depthTexture - 深度纹理
     * @param {DepthPackingStrategies} [depthPacking=BasicDepthPacking] - 深度打包方式
     */
	setDepthTexture(depthTexture, depthPacking = BasicDepthPacking) {
		// 尝试传递深度纹理，如果原生Pass支持的话
		// if (this.threePass && typeof this.threePass.setDepthTexture === "function") {
		//     this.threePass.setDepthTexture(depthTexture, depthPacking);
		// }
	}

	/**
     * 渲染Pass
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 包含上一个Pass结果的帧缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 作为输出的渲染目标，除非此Pass直接渲染到屏幕
     * @param {Number} [deltaTime] - 上一帧与当前帧之间的时间差（秒）
     * @param {Boolean} [stencilTest] - 指示模板测试是否处于活动状态
     * @param {DepthPass} [depthPass] - 可选的共享深度Pass，用于优化多个效果
     */
	render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {

		// 保存当前渲染器状态
		const currentRenderTarget = renderer.getRenderTarget();

		// Three.js原生Pass的render方法参数与项目中的不完全一致
		// 通常是: renderer, writeBuffer, readBuffer, deltaTime, maskActive
		const writeBuffer = this.renderToScreen ? null : outputBuffer;
		const readBuffer = inputBuffer;
		const maskActive = stencilTest || false;

		// 检查是否是SSRPass，如果是需要特殊处理
		// 确保SSRPass可以访问正确的输入输出缓冲区
		this.threePass.beautyRenderTarget = inputBuffer;
		this.threePass.renderToScreen = this.renderToScreen;

		// 调用Three.js Pass的render方法
		this.threePass.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);

		// 恢复原始渲染器状态
		renderer.setRenderTarget(currentRenderTarget);

	}

	/**
     * 销毁Pass
     */
	dispose() {

		if(this.threePass && typeof this.threePass.dispose === "function") {

			this.threePass.dispose();

		}

		super.dispose();

	}

}
