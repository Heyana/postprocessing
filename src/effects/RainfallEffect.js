import { Color, DataTexture, RepeatWrapping, TextureLoader, Uniform, Vector2, Vector3, RGBAFormat, UnsignedByteType, LinearFilter } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/rainfall.frag";
import vertexShader from "./glsl/rainfall.vert";

/**
 * 降雨效果 - 模拟真实的雨滴和雨幕效果
 *
 * 该效果包含雨滴、雨幕、积水反射、湿润效果等多种雨天表现
 */
export class RainfallEffect extends Effect {

    /**
     * 构造一个新的降雨效果
     *
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     * @param {Number} [options.intensity=0.8] - 降雨强度，0-1
     * @param {Number} [options.rainSpeed=1.2] - 雨滴下落速度
     * @param {Number} [options.rainSize=0.15] - 雨滴大小
     * @param {Vector2} [options.windDirection=new Vector2(0.2, 0.0)] - 风向影响
     * @param {Number} [options.rainAngle=15.0] - 雨滴倾斜角度（度）
     * @param {Color|String|Number} [options.rainColor=0x87ceeb] - 雨滴颜色
     * @param {Number} [options.wetness=0.5] - 湿润程度，影响表面反射
     * @param {Number} [options.puddleIntensity=0.3] - 积水强度
     * @param {Number} [options.mistIntensity=0.2] - 雨雾强度
     * @param {Boolean} [options.enableLighting=true] - 是否启用闪电效果
     * @param {Number} [options.lightningFrequency=0.1] - 闪电频率
     * @param {Vector3} [options.lightningColor=new Vector3(1.0, 0.9, 0.8)] - 闪电颜色
     */
    constructor({
        blendFunction = BlendFunction.ALPHA,
        intensity = 0.8,
        rainSpeed = 1.2,
        rainSize = 0.15,
        windDirection = new Vector2(0.2, 0.0),
        rainAngle = 15.0,
        rainColor = 0x87ceeb,
        wetness = 0.5,
        puddleIntensity = 0.3,
        mistIntensity = 0.2,
        enableLighting = true,
        lightningFrequency = 0.1,
        lightningColor = new Vector3(1.0, 0.9, 0.8)
    } = {}) {

        super("RainfallEffect", fragmentShader, {
            blendFunction,
            vertexShader,
            uniforms: new Map([
                ["texelSize", new Uniform(new Vector2())],
                ["time", new Uniform(0.0)],
                ["intensity", new Uniform(intensity)],
                ["rainSpeed", new Uniform(rainSpeed)],
                ["rainSize", new Uniform(rainSize)],
                ["windDirection", new Uniform(new Vector2().copy(windDirection))],
                ["rainAngle", new Uniform(rainAngle * Math.PI / 180.0)], // 转换为弧度
                ["rainColor", new Uniform(new Color(rainColor))],
                ["wetness", new Uniform(wetness)],
                ["puddleIntensity", new Uniform(puddleIntensity)],
                ["mistIntensity", new Uniform(mistIntensity)],
                ["enableLighting", new Uniform(enableLighting ? 1 : 0)],
                ["lightningFrequency", new Uniform(lightningFrequency)],
                ["lightningColor", new Uniform(lightningColor.clone())],
                ["noiseTexture", new Uniform(null)],
                ["lightningTime", new Uniform(0.0)],
                ["lightningFlash", new Uniform(0.0)]
            ])
        });

        this.time = 0.0;
        this._lightningTimer = 0.0;
        this._nextLightning = Math.random() * 10.0; // 随机下一次闪电时间

        // 创建噪声纹理
        this._createNoiseTexture();
    }

    /**
     * 创建噪声纹理，用于雨滴的随机分布和形态
     *
     * @private
     */
    _createNoiseTexture() {
        const size = 256;
        const data = new Uint8Array(size * size * 4);

        // 生成多频率噪声
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const index = (i * size + j) * 4;

                // 基础噪声
                data[index] = Math.floor(Math.random() * 255);
                data[index + 1] = Math.floor(Math.random() * 255);

                // 湍流噪声（用于风的影响）
                const x = i / size;
                const y = j / size;
                const turbulence = Math.sin(x * 12.0 + Math.cos(y * 8.0)) * 0.5 + 0.5;
                data[index + 2] = Math.floor(turbulence * 255);

                data[index + 3] = 255;
            }
        }

        const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.needsUpdate = true;

        this.uniforms.get("noiseTexture").value = texture;
    }

    /**
     * 降雨强度
     * @type {Number}
     */
    get intensity() {
        return this.uniforms.get("intensity").value;
    }

    set intensity(value) {
        this.uniforms.get("intensity").value = Math.max(0, Math.min(1, value));
    }

    /**
     * 雨滴下落速度
     * @type {Number}
     */
    get rainSpeed() {
        return this.uniforms.get("rainSpeed").value;
    }

    set rainSpeed(value) {
        this.uniforms.get("rainSpeed").value = Math.max(0, value);
    }

    /**
     * 雨滴大小
     * @type {Number}
     */
    get rainSize() {
        return this.uniforms.get("rainSize").value;
    }

    set rainSize(value) {
        this.uniforms.get("rainSize").value = Math.max(0, value);
    }

    /**
     * 风向影响
     * @type {Vector2}
     */
    get windDirection() {
        return this.uniforms.get("windDirection").value;
    }

    set windDirection(value) {
        this.uniforms.get("windDirection").value.copy(value);
    }

    /**
     * 雨滴倾斜角度（弧度）
     * @type {Number}
     */
    get rainAngle() {
        return this.uniforms.get("rainAngle").value;
    }

    set rainAngle(value) {
        // 输入为度，转换为弧度
        this.uniforms.get("rainAngle").value = value * Math.PI / 180.0;
    }

    /**
     * 雨滴颜色
     * @type {Color}
     */
    get rainColor() {
        return this.uniforms.get("rainColor").value;
    }

    set rainColor(value) {
        this.uniforms.get("rainColor").value.set(value);
    }

    /**
     * 湿润程度
     * @type {Number}
     */
    get wetness() {
        return this.uniforms.get("wetness").value;
    }

    set wetness(value) {
        this.uniforms.get("wetness").value = Math.max(0, Math.min(1, value));
    }

    /**
     * 积水强度
     * @type {Number}
     */
    get puddleIntensity() {
        return this.uniforms.get("puddleIntensity").value;
    }

    set puddleIntensity(value) {
        this.uniforms.get("puddleIntensity").value = Math.max(0, Math.min(1, value));
    }

    /**
     * 雨雾强度
     * @type {Number}
     */
    get mistIntensity() {
        return this.uniforms.get("mistIntensity").value;
    }

    set mistIntensity(value) {
        this.uniforms.get("mistIntensity").value = Math.max(0, Math.min(1, value));
    }

    /**
     * 是否启用闪电效果
     * @type {Boolean}
     */
    get enableLighting() {
        return Boolean(this.uniforms.get("enableLighting").value);
    }

    set enableLighting(value) {
        this.uniforms.get("enableLighting").value = value ? 1 : 0;
    }

    /**
     * 闪电频率
     * @type {Number}
     */
    get lightningFrequency() {
        return this.uniforms.get("lightningFrequency").value;
    }

    set lightningFrequency(value) {
        this.uniforms.get("lightningFrequency").value = Math.max(0, value);
    }

    /**
     * 设置雨天预设
     * @param {String} preset - 预设名称：'light', 'moderate', 'heavy', 'storm'
     */
    setRainPreset(preset) {
        switch (preset.toLowerCase()) {
            case 'light':
                this.intensity = 0.3;
                this.rainSpeed = 0.8;
                this.rainSize = 0.1;
                this.wetness = 0.2;
                this.puddleIntensity = 0.1;
                this.mistIntensity = 0.1;
                this.enableLighting = false;
                break;

            case 'moderate':
                this.intensity = 0.6;
                this.rainSpeed = 1.0;
                this.rainSize = 0.15;
                this.wetness = 0.4;
                this.puddleIntensity = 0.3;
                this.mistIntensity = 0.2;
                this.enableLighting = false;
                break;

            case 'heavy':
                this.intensity = 0.8;
                this.rainSpeed = 1.3;
                this.rainSize = 0.2;
                this.wetness = 0.6;
                this.puddleIntensity = 0.5;
                this.mistIntensity = 0.3;
                this.enableLighting = true;
                this.lightningFrequency = 0.05;
                break;

            case 'storm':
                this.intensity = 1.0;
                this.rainSpeed = 1.8;
                this.rainSize = 0.25;
                this.wetness = 0.8;
                this.puddleIntensity = 0.7;
                this.mistIntensity = 0.4;
                this.enableLighting = true;
                this.lightningFrequency = 0.15;
                break;
        }
    }

    /**
     * 更新效果
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 渲染帧间隔时间
     */
    update(renderer, inputBuffer, deltaTime) {
        this.time += deltaTime || 0.016;
        this.uniforms.get("time").value = this.time;

        // 处理闪电效果
        if (this.enableLighting) {
            this._lightningTimer += deltaTime || 0.016;

            if (this._lightningTimer >= this._nextLightning) {
                // 触发闪电
                this.uniforms.get("lightningFlash").value = 1.0;
                this.uniforms.get("lightningTime").value = this.time;

                // 设置下一次闪电时间
                this._nextLightning = (Math.random() * 5.0 + 2.0) / this.lightningFrequency;
                this._lightningTimer = 0.0;
            } else {
                // 闪电逐渐消失
                const flashValue = this.uniforms.get("lightningFlash").value;
                this.uniforms.get("lightningFlash").value = Math.max(0, flashValue - deltaTime * 3.0);
            }
        }
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
