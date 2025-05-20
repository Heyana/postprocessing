import { Uniform, Vector2 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

import fragmentShader from "./glsl/enhanced-sharpen.frag";

/**
 * 自适应锐化效果 - 根据局部对比度自动调整锐化强度
 *
 * 该效果比基本锐化更智能，能够在不同区域应用适当的锐化强度，
 * 避免过度锐化产生噪点，同时保持细节清晰。
 */
export class AdaptiveSharpenEffect extends Effect {

	/**
     * 构造一个新的自适应锐化效果
     *
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.intensity=0.5] - 锐化强度，值越大效果越明显
     * @param {Number} [options.kernelSize=1.0] - 锐化核大小，控制影响范围
     * @param {Boolean} [options.adaptiveSharpening=true] - 是否启用自适应锐化
     * @param {Number} [options.threshold=0.1] - 对比度阈值，用于自适应锐化
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		intensity = 0.5,
		kernelSize = 1.0,
		adaptiveSharpening = true,
		threshold = 0.1
	} = {}) {

		super("AdaptiveSharpenEffect", fragmentShader, {
			blendFunction,
			uniforms: new Map([
				["intensity", new Uniform(intensity)],
				["texelSize", new Uniform(new Vector2())],
				["kernelSize", new Uniform(kernelSize)],
				["adaptiveSharpening", new Uniform(adaptiveSharpening)],
				["threshold", new Uniform(threshold)]
			])
		});

	}

	/**
     * 锐化强度
     *
     * @type {Number}
     */
	get intensity() {

		return this.uniforms.get("intensity").value;

	}

	set intensity(value) {

		this.uniforms.get("intensity").value = value;

	}

	/**
     * 锐化核大小
     *
     * @type {Number}
     */
	get kernelSize() {

		return this.uniforms.get("kernelSize").value;

	}

	set kernelSize(value) {

		this.uniforms.get("kernelSize").value = value;

	}

	/**
     * 是否启用自适应锐化
     *
     * @type {Boolean}
     */
	get adaptiveSharpening() {

		return this.uniforms.get("adaptiveSharpening").value;

	}

	set adaptiveSharpening(value) {

		this.uniforms.get("adaptiveSharpening").value = value;

	}

	/**
     * 对比度阈值
     *
     * @type {Number}
     */
	get threshold() {

		return this.uniforms.get("threshold").value;

	}

	set threshold(value) {

		this.uniforms.get("threshold").value = value;

	}

	/**
     * 当渲染尺寸改变时更新纹素大小
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		this.uniforms.get("texelSize").value.set(1.0 / width, 1.0 / height);

	}

}
