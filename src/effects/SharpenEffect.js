import { Uniform, Vector2 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";

import fragmentShader from "./glsl/sharpen.frag";

/**
 * 锐化效果 - 增强图像细节和边缘，提高整体清晰度
 * 
 * 该效果通过拉普拉斯算子对图像进行卷积操作，
 * 增强图像中的高频信息，使图像看起来更加锐利。
 */
export class SharpenEffect extends Effect {
    /**
     * 构造一个新的锐化效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.intensity=0.5] - 锐化强度，值越大效果越明显
     * @param {Number} [options.kernelSize=1.0] - 锐化核大小，控制影响范围
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        intensity = 0.5,
        kernelSize = 1.0
    } = {}) {
        super("SharpenEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["intensity", new Uniform(intensity)],
                ["texelSize", new Uniform(new Vector2())],
                ["kernelSize", new Uniform(kernelSize)]
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
     * 当渲染尺寸改变时更新纹素大小
     * 
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        this.uniforms.get("texelSize").value.set(1.0 / width, 1.0 / height);
    }
} 