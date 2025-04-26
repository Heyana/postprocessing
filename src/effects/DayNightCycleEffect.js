import { Uniform, Vector2, Vector3, LinearFilter, DataTexture, RepeatWrapping } from "three";
import { BlendFunction } from "postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/day-night-cycle.frag.glsl";

/**
 * 日夜循环天空效果
 * 
 * 此效果模拟真实的天空，基于László Matuska (@BitOfGold)的Shadertoy着色器
 */
export class DayNightCycleEffect extends Effect {

    /**
     * 构造函数
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     */
    constructor({
        blendFunction = BlendFunction.SCREEN
    } = {}) {
        super("DayNightCycleEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["time", new Uniform(0.0)],
                ["noiseTexture", new Uniform(null)]
            ])
        });

        // 创建默认噪声纹理
        this.createDefaultNoiseTexture();
    }

    /**
     * 创建默认噪声纹理
     * 用于在没有设置纹理时提供基本云噪声
     * @private
     */
    createDefaultNoiseTexture() {
        const size = 64;
        const data = new Uint8Array(size * size * 4);

        for (let i = 0; i < size * size; i++) {
            data[i * 4] = Math.random() * 255;
            data[i * 4 + 1] = Math.random() * 255;
            data[i * 4 + 2] = Math.random() * 255;
            data[i * 4 + 3] = 255;
        }

        const texture = new DataTexture(data, size, size);
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.needsUpdate = true;

        this.uniforms.get("noiseTexture").value = texture;
    }

    /**
     * 设置噪声纹理
     * 
     * @param {Texture} texture - 噪声纹理
     */
    setNoiseTexture(texture) {
        if (texture !== null) {
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            texture.wrapS = texture.wrapT = RepeatWrapping;
        }
        this.uniforms.get("noiseTexture").value = texture;
    }

    /**
     * 更新效果
     * 
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 时间增量
     */
    update(renderer, inputBuffer, deltaTime) {
        // 更新时间，用于云层动画
        this.uniforms.get("time").value += deltaTime;
    }
} 