import { Uniform, Vector2 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

import fragmentShader from "./glsl/bilateral-denoise.frag";

/**
 * 双边滤波降噪效果 - 在平滑噪点的同时保留边缘细节
 *
 * 该效果使用双边滤波算法对图像进行降噪处理，能够在保留边缘和细节的同时
 * 有效减少图像中的随机噪点，特别适用于光线追踪、环境光遮蔽等产生噪点的渲染效果。
 */
export class DenoiseEffect extends Effect {

	/**
     * 构造一个新的双边滤波降噪效果
     *
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.radius=4.0] - 滤波半径，值越大影响范围越广
     * @param {Number} [options.strength=0.5] - 降噪强度，值越大效果越明显
     * @param {Boolean} [options.luminanceOnly=false] - 是否仅对亮度通道应用降噪
     * @param {Number} [options.edgePreservation=0.5] - 边缘保留强度，值越大边缘越锐利
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		radius = 4.0,
		strength = 0.5,
		luminanceOnly = false,
		edgePreservation = 0.5
	} = {}) {

		super("DenoiseEffect", fragmentShader, {
			blendFunction,
			uniforms: new Map([
				["texelSize", new Uniform(new Vector2())],
				["radius", new Uniform(radius)],
				["strength", new Uniform(strength)],
				["luminanceOnly", new Uniform(luminanceOnly)],
				["edgePreservation", new Uniform(edgePreservation)]
			])
		});

	}

	/**
     * 降噪半径
     *
     * @type {Number}
     */
	get radius() {

		return this.uniforms.get("radius").value;

	}

	set radius(value) {

		this.uniforms.get("radius").value = value;

	}

	/**
     * 降噪强度
     *
     * @type {Number}
     */
	get strength() {

		return this.uniforms.get("strength").value;

	}

	set strength(value) {

		this.uniforms.get("strength").value = value;

	}

	/**
     * 是否仅对亮度通道应用降噪
     *
     * @type {Boolean}
     */
	get luminanceOnly() {

		return this.uniforms.get("luminanceOnly").value;

	}

	set luminanceOnly(value) {

		this.uniforms.get("luminanceOnly").value = value;

	}

	/**
     * 边缘保留强度
     *
     * @type {Number}
     */
	get edgePreservation() {

		return this.uniforms.get("edgePreservation").value;

	}

	set edgePreservation(value) {

		this.uniforms.get("edgePreservation").value = value;

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
