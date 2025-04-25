import { Uniform, Vector2, Vector3, Color, LinearFilter, RGBAFormat, WebGLRenderTarget, HalfFloatType, Matrix4, RepeatWrapping, DataTexture } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect, EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/sky-atmosphere.frag.glsl";

/**
 * 高级体积云和大气散射效果
 * 
 * 此效果模拟真实的体积云、体积光和大气散射
 * 基于robobo1221的PBR体积云技术
 */
export class SkyAtmosphereEffect extends Effect {

    /**
     * 构造函数
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     * @param {Vector3} [options.sunPosition=new Vector3(0.1, 0.05, -1).normalize()] - 太阳位置（方向向量）
     * @param {Boolean} [options.animateClouds=true] - 是否启用云层动画
     * @param {Number} [options.intensity=12.0] - 散射强度
     * @param {Number} [options.rayleighCoefficient=1.0] - 瑞利散射系数
     * @param {Number} [options.mieCoefficient=0.8] - 米氏散射系数
     * @param {Number} [options.mieDirectionalG=0.8] - 米氏散射方向性参数（0-1）
     * @param {Number} [options.cloudiness=1.0] - 云层密度
     * @param {Number} [options.fov=60.0] - 视场角（度）
     * @param {Number} [options.skyBlueness=0.5] - 天空蓝度增强
     * @param {Number} [options.cloudAmount=1.0] - 云层数量
     * @param {Number} [options.cloudScale=1.0] - 云层尺度
     * @param {Number} [options.cloudThreshold=0.0] - 云层阈值
     */
    constructor({
        blendFunction = BlendFunction.SCREEN,
        sunPosition = new Vector3(0.1, 0.05, -1).normalize(),
        animateClouds = true,
        intensity = 12.0,
        rayleighCoefficient = 1.0,
        mieCoefficient = 0.8,
        mieDirectionalG = 0.8,
        cloudiness = 1.0,
        fov = 60.0,
        skyBlueness = 0.5,
        cloudAmount = 1.0,
        cloudScale = 1.0,
        cloudThreshold = 0.0
    } = {}) {
        super("SkyAtmosphereEffect", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["sunPosition", new Uniform(sunPosition)],
                ["intensity", new Uniform(intensity)],
                ["animateClouds", new Uniform(animateClouds ? 1 : 0)],
                ["time", new Uniform(0.0)],
                ["resolution", new Uniform(new Vector2(1, 1))],
                ["noiseTexture", new Uniform(null)],
                ["rayleighCoefficient", new Uniform(rayleighCoefficient)],
                ["mieCoefficient", new Uniform(mieCoefficient)],
                ["mieDirectionalG", new Uniform(mieDirectionalG)],
                ["cloudiness", new Uniform(cloudiness)],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["fov", new Uniform(fov)],
                ["skyBlueness", new Uniform(skyBlueness)],
                ["cloudAmount", new Uniform(cloudAmount)],
                ["cloudScale", new Uniform(cloudScale)],
                ["cloudThreshold", new Uniform(cloudThreshold)]
            ])
        });

        /**
         * 太阳位置方向
         * @type {Vector3}
         */
        this.sunPosition = sunPosition;

        /**
         * 云层动画开关
         * @type {Boolean}
         */
        this.animateClouds = animateClouds;

        /**
         * 散射强度
         * @type {Number}
         */
        this.intensity = intensity;

        /**
         * 瑞利散射系数
         * @type {Number}
         */
        this.rayleighCoefficient = rayleighCoefficient;

        /**
         * 米氏散射系数
         * @type {Number}
         */
        this.mieCoefficient = mieCoefficient;

        /**
         * 米氏散射方向性参数
         * @type {Number}
         */
        this.mieDirectionalG = mieDirectionalG;

        /**
         * 云层密度
         * @type {Number}
         */
        this.cloudiness = cloudiness;

        /**
         * 视场角（度）
         * @type {Number}
         */
        this._fov = fov;

        /**
         * 天空蓝度增强
         * @type {Number}
         */
        this._skyBlueness = skyBlueness;

        /**
         * 云层数量
         * @type {Number}
         */
        this._cloudAmount = cloudAmount;

        /**
         * 云层尺度
         * @type {Number}
         */
        this._cloudScale = cloudScale;

        /**
         * 云层阈值
         * @type {Number}
         */
        this._cloudThreshold = cloudThreshold;

        /**
         * 相机对象，用于获取视图矩阵
         * @type {Camera}
         * @private
         */
        this._camera = null;

        // 创建默认噪声纹理
        this.createDefaultNoiseTexture();
    }

    /**
     * 获取视场角
     * @return {Number} 视场角（度）
     */
    get fov() {
        return this._fov;
    }

    /**
     * 设置视场角
     * @param {Number} value - 视场角（度）
     */
    set fov(value) {
        this._fov = value;
        this.uniforms.get("fov").value = value;
    }

    /**
     * 获取天空蓝度增强值
     * @return {Number} 蓝度增强值
     */
    get skyBlueness() {
        return this._skyBlueness;
    }

    /**
     * 设置天空蓝度增强值
     * @param {Number} value - 蓝度增强值
     */
    set skyBlueness(value) {
        this._skyBlueness = value;
        this.uniforms.get("skyBlueness").value = value;
    }

    /**
     * 获取云层数量
     * @return {Number} 云层数量
     */
    get cloudAmount() {
        return this._cloudAmount;
    }

    /**
     * 设置云层数量
     * @param {Number} value - 云层数量
     */
    set cloudAmount(value) {
        this._cloudAmount = value;
        this.uniforms.get("cloudAmount").value = value;
    }

    /**
     * 获取云层尺度
     * @return {Number} 云层尺度
     */
    get cloudScale() {
        return this._cloudScale;
    }

    /**
     * 设置云层尺度
     * @param {Number} value - 云层尺度
     */
    set cloudScale(value) {
        this._cloudScale = value;
        this.uniforms.get("cloudScale").value = value;
    }

    /**
     * 获取云层阈值
     * @return {Number} 云层阈值
     */
    get cloudThreshold() {
        return this._cloudThreshold;
    }

    /**
     * 设置云层阈值
     * @param {Number} value - 云层阈值
     */
    set cloudThreshold(value) {
        this._cloudThreshold = value;
        this.uniforms.get("cloudThreshold").value = value;
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
     * 设置相机
     * 
     * @param {Camera} camera - 相机对象
     */
    setCamera(camera) {
        this._camera = camera;
        if (camera) {
            // 当设置相机时，自动同步FOV
            this.fov = camera.fov;
        }
    }

    /**
     * 更新效果
     * 
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 时间增量
     */
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get("time").value += deltaTime;

        // 更新分辨率
        const size = renderer.getSize(new Vector2());
        this.uniforms.get("resolution").value.set(size.width, size.height);

        // 更新云层动画开关
        this.uniforms.get("animateClouds").value = this.animateClouds ? 1 : 0;

        // 更新强度和散射参数
        this.uniforms.get("intensity").value = this.intensity;
        this.uniforms.get("rayleighCoefficient").value = this.rayleighCoefficient;
        this.uniforms.get("mieCoefficient").value = this.mieCoefficient;
        this.uniforms.get("mieDirectionalG").value = this.mieDirectionalG;
        this.uniforms.get("cloudiness").value = this.cloudiness;

        // 更新新增参数
        this.uniforms.get("skyBlueness").value = this._skyBlueness;
        this.uniforms.get("cloudAmount").value = this._cloudAmount;
        this.uniforms.get("cloudScale").value = this._cloudScale;
        this.uniforms.get("cloudThreshold").value = this._cloudThreshold;

        // 更新相机视图矩阵
        if (this._camera) {
            const viewMatrix = this.uniforms.get("viewMatrix").value;
            viewMatrix.copy(this._camera.matrixWorld);

            // 如果相机FOV已更改，同步到着色器
            if (this._camera.fov !== this._fov) {
                this.fov = this._camera.fov;
            }
        }
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
     * 设置物理尺寸参数
     * 
     * @param {Object} parameters - 物理参数
     * @param {Number} [parameters.earthRadius=6360e3] - 地球半径（米）
     * @param {Number} [parameters.atmosphereRadius=6380e3] - 大气层半径（米）
     * @param {Number} [parameters.rayleighHeight=8e3] - 瑞利散射高度（米）
     * @param {Number} [parameters.mieHeight=1.2e3] - 米氏散射高度（米）
     */
    setPhysicalParameters({
        earthRadius = 6360e3,
        atmosphereRadius = 6380e3,
        rayleighHeight = 8e3,
        mieHeight = 1.2e3
    } = {}) {
        // 在实际实现中，这些参数可以通过uniforms传递给着色器
        // 目前示例中这些值是硬编码的
    }
} 