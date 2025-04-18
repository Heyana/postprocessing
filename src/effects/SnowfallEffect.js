import { Color, DataTexture, RepeatWrapping, TextureLoader, Uniform, Vector2, WebGLRenderTarget, RGBAFormat, UnsignedByteType, LinearFilter } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/snowfall.frag";
import vertexShader from "./glsl/snowfall.vert";
import { blueNoiseBase64 } from "src/libs/realism-effects/src/utils/TextureAssets.js";

/**
 * 雪花飘落效果 - 模拟雪花飘落的效果
 * 
 * 该效果在场景中添加动态的雪花飘落效果，可以调整风向和雪花密度等参数。
 */
export class SnowfallEffect extends Effect {
    /**
     * 构造一个新的雪花飘落效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     * @param {Number} [options.density=0.6] - 雪花密度，0-1
     * @param {Number} [options.snowSpeed=0.2] - 雪花下落速度
     * @param {Number} [options.snowSize=0.2] - 雪花大小
     * @param {Vector2} [options.windDirection=new Vector2(0.1, 0.0)] - 风向
     * @param {Color|String|Number} [options.snowColor=0xffffff] - 雪花颜色
     * @param {Number} [options.alphaTest=0.1] - 透明度测试阈值，低于此值的像素不会显示雪花
     * @param {Number} [options.debugMode=0] - 调试模式: 0=正常, 1=显示UV, 2=显示UV旋转, 3-7=显示不同雪花层, 8=纯色
     * @param {Number} [options.activeLayer=-1] - 活跃的雪花层: -1=全部, 0-4=单独某层
     */
    constructor({
        blendFunction = BlendFunction.SCREEN,
        density = 0.6,
        snowSpeed = 0.2,
        snowSize = 0.2,
        windDirection = new Vector2(0.1, 0.0),
        snowColor = 0xffffff,
        alphaTest = 0.1,
        debugMode = 0,
        activeLayer = -1
    } = {}) {
        super("SnowfallEffect", fragmentShader, {
            blendFunction,
            vertexShader,
            uniforms: new Map([
                ["texelSize", new Uniform(new Vector2())],
                ["time", new Uniform(0.0)],
                ["density", new Uniform(density)],
                ["snowSpeed", new Uniform(snowSpeed)],
                ["snowSize", new Uniform(snowSize)],
                ["windDirection", new Uniform(new Vector2().copy(windDirection))],
                ["snowColor", new Uniform(new Color(snowColor))],
                ["noiseTexture", new Uniform(null)],
                ["alphaTest", new Uniform(alphaTest)],
                ["debugMode", new Uniform(debugMode)],
                ["activeLayer", new Uniform(activeLayer)]
            ])
        });

        this.time = 0.0;

        // 创建或加载噪声纹理
        this._createNoiseTexture();
    }

    /**
     * 创建噪声纹理，用于雪花的随机变化
     * 
     * @private
     */
    _createNoiseTexture() {
        try {
            // 尝试加载噪声纹理
            const texture = new TextureLoader().load(blueNoiseBase64);
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            texture.needsUpdate = true;

            this.uniforms.get("noiseTexture").value = texture;
        } catch (error) {
            console.error("无法加载雪花纹理:", error);
            // 创建更高质量的备用纹理
            const size = 128; // 增加纹理尺寸以提供更好的细节
            const data = new Uint8Array(size * size * 4);

            // 创建更加随机的噪声，使用更好的随机分布
            for (let i = 0; i < size; i++) {
                for (let j = 0; j < size; j++) {
                    const index = (i * size + j) * 4;
                    // 使用不同的随机值生成方式，确保更好的雪花分布
                    data[index] = Math.floor(Math.random() * 255);
                    data[index + 1] = Math.floor(Math.random() * 255);
                    data[index + 2] = Math.floor(Math.random() * 255);
                    data[index + 3] = 255;
                }
            }

            const fallbackTexture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
            fallbackTexture.wrapS = RepeatWrapping;
            fallbackTexture.wrapT = RepeatWrapping;
            fallbackTexture.minFilter = LinearFilter;
            fallbackTexture.magFilter = LinearFilter;
            fallbackTexture.needsUpdate = true;

            this.uniforms.get("noiseTexture").value = fallbackTexture;
            console.log("使用备用噪声纹理");
        }
    }

    /**
     * 调试模式
     * 0=正常, 1=显示UV, 2=显示UV旋转, 3-7=显示不同雪花层, 8=纯色
     * @type {Number}
     */
    get debugMode() {
        return this.uniforms.get("debugMode").value;
    }

    set debugMode(value) {
        this.uniforms.get("debugMode").value = value;
    }

    /**
     * 活跃的雪花层
     * -1=全部, 0-4=单独某层
     * @type {Number}
     */
    get activeLayer() {
        return this.uniforms.get("activeLayer").value;
    }

    set activeLayer(value) {
        this.uniforms.get("activeLayer").value = value;
    }

    /**
     * 透明度测试阈值
     * 
     * @type {Number}
     */
    get alphaTest() {
        return this.uniforms.get("alphaTest").value;
    }

    set alphaTest(value) {
        this.uniforms.get("alphaTest").value = value;
    }

    /**
     * 雪花密度
     * 
     * @type {Number}
     */
    get density() {
        return this.uniforms.get("density").value;
    }

    set density(value) {
        this.uniforms.get("density").value = value;
    }

    /**
     * 雪花下落速度
     * 
     * @type {Number}
     */
    get snowSpeed() {
        return this.uniforms.get("snowSpeed").value;
    }

    set snowSpeed(value) {
        this.uniforms.get("snowSpeed").value = value;
    }

    /**
     * 雪花大小
     * 
     * @type {Number}
     */
    get snowSize() {
        return this.uniforms.get("snowSize").value;
    }

    set snowSize(value) {
        this.uniforms.get("snowSize").value = value;
    }

    /**
     * 风向
     * 
     * @type {Vector2}
     */
    get windDirection() {
        return this.uniforms.get("windDirection").value;
    }

    set windDirection(value) {
        this.uniforms.get("windDirection").value.copy(value);
    }

    /**
     * 雪花颜色
     * 
     * @type {Color}
     */
    get snowColor() {
        return this.uniforms.get("snowColor").value;
    }

    set snowColor(value) {
        this.uniforms.get("snowColor").value.set(value);
    }

    /**
     * 更新效果
     * 
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 渲染帧间隔时间
     */
    update(renderer, inputBuffer, deltaTime) {
        this.time += deltaTime || 0.016; // 默认为60fps
        this.uniforms.get("time").value = this.time;
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