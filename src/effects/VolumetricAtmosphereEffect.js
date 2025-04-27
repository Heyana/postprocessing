import { Uniform, Vector2, Vector3, Matrix4, DataTexture, LinearFilter, RepeatWrapping, MathUtils } from "three";
import { BlendFunction } from "postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/volumetric-atmosphere.frag.glsl";

/**
 * 体积大气散射效果
 * 
 * 此效果专注于模拟体积雾和大气散射，提供逼真的体积雾和光线散射效果
 * 基于László Matuska的Shadertoy着色器的简化版本
 */
export class VolumetricAtmosphereEffect extends Effect {

    /**
     * 构造函数
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Vector3} [options.sunPosition=new Vector3(0.1, 0.5, -1).normalize()] - 光源位置（方向向量）
     * @param {Boolean} [options.animateClouds=true] - 是否启用雾动画
     * @param {Number} [options.fogDensity=0.6] - 雾密度 (0-1)
     * @param {Number} [options.height=500.0] - 观察者高度
     * @param {Number} [options.hazeDensity=0.1] - 雾霾密度
     * @param {Number} [options.scatteringStrength=1.0] - 散射强度
     * @param {Number} [options.fogColor=0.3] - 雾颜色色调 (0-1，0=蓝色，1=暖色)
     * @param {Number} [options.fogDepthMask=0.998] - 雾深度阈值
     * @param {Number} [options.fov=60.0] - 视场角（度）
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        sunPosition = new Vector3(0.1, 0.5, -1).normalize(),
        animateClouds = true,
        fogDensity = 0.6,
        height = 500.0,
        hazeDensity = 0.1,
        scatteringStrength = 1.0,
        fogColor = 0.3,
        fogDepthMask = 0.998,
        fov = 60.0
    } = {}) {
        super("VolumetricAtmosphereEffect", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["sunPosition", new Uniform(sunPosition)],
                ["animateClouds", new Uniform(animateClouds ? 1 : 0)],
                ["fogDensity", new Uniform(fogDensity)],
                ["height", new Uniform(height)],
                ["hazeDensity", new Uniform(hazeDensity)],
                ["scatteringStrength", new Uniform(scatteringStrength)],
                ["fogColor", new Uniform(fogColor)],
                ["fogDepthMask", new Uniform(fogDepthMask)],
                ["time", new Uniform(0.0)],
                ["resolution", new Uniform(new Vector2(1, 1))],
                ["noiseTexture", new Uniform(null)],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["fov", new Uniform(fov)]
            ])
        });

        /**
         * 光源位置方向
         * @type {Vector3}
         */
        this.sunPosition = sunPosition;

        /**
         * 雾动画开关
         * @type {Boolean}
         */
        this.animateClouds = animateClouds;

        /**
         * 雾密度
         * @type {Number}
         */
        this._fogDensity = fogDensity;

        /**
         * 观察者高度
         * @type {Number}
         */
        this._height = height;

        /**
         * 雾霾密度
         * @type {Number}
         */
        this._hazeDensity = hazeDensity;

        /**
         * 散射强度
         * @type {Number}
         */
        this._scatteringStrength = scatteringStrength;

        /**
         * 雾颜色色调
         * @type {Number}
         */
        this._fogColor = fogColor;

        /**
         * 雾深度阈值
         * @type {Number}
         */
        this._fogDepthMask = fogDepthMask;

        /**
         * 视场角（度）
         * @type {Number}
         */
        this._fov = fov;

        /**
         * 相机对象，用于获取视图矩阵
         * @type {Camera}
         * @private
         */
        this._camera = null;

        // 创建默认噪声纹理，实际使用时会被替换
        this.createDefaultNoiseTexture();
    }

    /**
     * 获取雾密度
     * @return {Number} 雾密度
     */
    get fogDensity() {
        return this._fogDensity;
    }

    /**
     * 设置雾密度
     * @param {Number} value - 雾密度
     */
    set fogDensity(value) {
        this._fogDensity = value;
        this.uniforms.get("fogDensity").value = value;
    }

    /**
     * 获取观察者高度
     * @return {Number} 观察者高度
     */
    get height() {
        return this._height;
    }

    /**
     * 设置观察者高度
     * @param {Number} value - 观察者高度
     */
    set height(value) {
        this._height = value;
        this.uniforms.get("height").value = value;
    }

    /**
     * 获取雾霾密度
     * @return {Number} 雾霾密度
     */
    get hazeDensity() {
        return this._hazeDensity;
    }

    /**
     * 设置雾霾密度
     * @param {Number} value - 雾霾密度
     */
    set hazeDensity(value) {
        this._hazeDensity = value;
        this.uniforms.get("hazeDensity").value = value;
    }

    /**
     * 获取散射强度
     * @return {Number} 散射强度
     */
    get scatteringStrength() {
        return this._scatteringStrength;
    }

    /**
     * 设置散射强度
     * @param {Number} value - 散射强度
     */
    set scatteringStrength(value) {
        this._scatteringStrength = value;
        this.uniforms.get("scatteringStrength").value = value;
    }

    /**
     * 获取雾颜色色调
     * @return {Number} 雾颜色色调
     */
    get fogColor() {
        return this._fogColor;
    }

    /**
     * 设置雾颜色色调
     * @param {Number} value - 雾颜色色调
     */
    set fogColor(value) {
        this._fogColor = value;
        this.uniforms.get("fogColor").value = value;
    }

    /**
     * 获取雾深度阈值
     * @return {Number} 雾深度阈值
     */
    get fogDepthMask() {
        return this._fogDepthMask;
    }

    /**
     * 设置雾深度阈值
     * @param {Number} value - 雾深度阈值
     */
    set fogDepthMask(value) {
        this._fogDepthMask = value;
        this.uniforms.get("fogDepthMask").value = value;
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
     * 创建默认噪声纹理
     * 用于在没有设置纹理时提供基本噪声
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
     * 设置光源位置
     * 使用高度角和方位角设置光源位置
     * 
     * @param {Number} elevation - 高度角（度）
     * @param {Number} azimuth - 方位角（度）
     */
    setLightPosition(elevation, azimuth) {
        const phi = MathUtils.degToRad(90 - elevation);
        const theta = MathUtils.degToRad(azimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        this.sunPosition.set(x, y, z).normalize();
        this.uniforms.get("sunPosition").value.copy(this.sunPosition);
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
        this.uniforms.get("time").value += deltaTime;

        // 更新分辨率
        const size = renderer.getSize(new Vector2());
        this.uniforms.get("resolution").value.set(size.width, size.height);

        // 更新动画开关
        this.uniforms.get("animateClouds").value = this.animateClouds ? 1 : 0;

        // 更新参数
        this.uniforms.get("fogDensity").value = this._fogDensity;
        this.uniforms.get("height").value = this._height;
        this.uniforms.get("hazeDensity").value = this._hazeDensity;
        this.uniforms.get("scatteringStrength").value = this._scatteringStrength;
        this.uniforms.get("fogColor").value = this._fogColor;
        this.uniforms.get("fogDepthMask").value = this._fogDepthMask;

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
} 