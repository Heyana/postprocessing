import { Uniform, Vector2, Vector3, Color, LinearFilter, RGBAFormat, WebGLRenderTarget, HalfFloatType, Matrix4, RepeatWrapping, DataTexture, MathUtils } from "three";
import { BlendFunction } from "postprocessing";
import { Effect, EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/day-night-cycle.frag.glsl";

/**
 * 日夜循环天空效果
 * 
 * 此效果模拟真实的昼夜循环天空，包括日出、日落、云层、星空等
 * 基于László Matuska (@BitOfGold)的Shadertoy着色器
 */
export class DayNightCycleEffect extends Effect {

    /**
     * 构造函数
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     * @param {Vector3} [options.sunPosition=new Vector3(0.1, 0.05, -1).normalize()] - 太阳位置（方向向量）
     * @param {Vector3} [options.moonPosition=new Vector3(-0.1, 0.05, -1).normalize()] - 月亮位置（方向向量）
     * @param {Boolean} [options.animateClouds=true] - 是否启用云层动画
     * @param {Number} [options.cloudy=0.6] - 云层密度 (0-1)
     * @param {Number} [options.height=500.0] - 观察者高度
     * @param {Number} [options.haze=0.1] - 雾霾程度
     * @param {Number} [options.cloudyhigh=0.05] - 高层云密度
     * @param {Number} [options.enableStars=true] - 是否启用星空
     * @param {Number} [options.starThreshold=0.99] - 星星密度阈值 (0.9-1.0)
     * @param {Number} [options.skyMaskThreshold=0.998] - 天空深度阈值 (0.9-1.0)
     * @param {Number} [options.fov=60.0] - 视场角（度）
     */
    constructor({
        blendFunction = BlendFunction.SCREEN,
        sunPosition = new Vector3(0.1, 0.05, -1).normalize(),
        moonPosition = new Vector3(-0.1, 0.05, -1).normalize(),
        animateClouds = true,
        cloudy = 0.6,
        height = 500.0,
        haze = 0.1,
        cloudyhigh = 0.05,
        enableStars = true,
        starThreshold = 0.99,
        skyMaskThreshold = 0.998,
        fov = 60.0
    } = {}) {
        super("DayNightCycleEffect", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["sunPosition", new Uniform(sunPosition)],
                ["moonPosition", new Uniform(moonPosition)],
                ["animateClouds", new Uniform(animateClouds ? 1 : 0)],
                ["cloudy", new Uniform(cloudy)],
                ["height", new Uniform(height)],
                ["haze", new Uniform(haze)],
                ["cloudyhigh", new Uniform(cloudyhigh)],
                ["enableStars", new Uniform(enableStars ? 1 : 0)],
                ["starThreshold", new Uniform(starThreshold)],
                ["skyMaskThreshold", new Uniform(skyMaskThreshold)],
                ["time", new Uniform(0.0)],
                ["resolution", new Uniform(new Vector2(1, 1))],
                ["noiseTexture", new Uniform(null)],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["fov", new Uniform(fov)]
            ])
        });

        /**
         * 太阳位置方向
         * @type {Vector3}
         */
        this.sunPosition = sunPosition;

        /**
         * 月亮位置方向
         * @type {Vector3}
         */
        this.moonPosition = moonPosition;

        /**
         * 云层动画开关
         * @type {Boolean}
         */
        this.animateClouds = animateClouds;

        /**
         * 云层密度
         * @type {Number}
         */
        this._cloudy = cloudy;

        /**
         * 观察者高度
         * @type {Number}
         */
        this._height = height;

        /**
         * 雾霾程度
         * @type {Number}
         */
        this._haze = haze;

        /**
         * 高层云密度
         * @type {Number}
         */
        this._cloudyhigh = cloudyhigh;

        /**
         * 启用星空
         * @type {Boolean}
         */
        this._enableStars = enableStars;

        /**
         * 星星密度阈值
         * @type {Number}
         */
        this._starThreshold = starThreshold;

        /**
         * 天空深度阈值
         * @type {Number}
         */
        this._skyMaskThreshold = skyMaskThreshold;

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
     * 获取云层密度
     * @return {Number} 云层密度
     */
    get cloudy() {
        return this._cloudy;
    }

    /**
     * 设置云层密度
     * @param {Number} value - 云层密度
     */
    set cloudy(value) {
        this._cloudy = value;
        this.uniforms.get("cloudy").value = value;
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
     * 获取雾霾程度
     * @return {Number} 雾霾程度
     */
    get haze() {
        return this._haze;
    }

    /**
     * 设置雾霾程度
     * @param {Number} value - 雾霾程度
     */
    set haze(value) {
        this._haze = value;
        this.uniforms.get("haze").value = value;
    }

    /**
     * 获取高层云密度
     * @return {Number} 高层云密度
     */
    get cloudyhigh() {
        return this._cloudyhigh;
    }

    /**
     * 设置高层云密度
     * @param {Number} value - 高层云密度
     */
    set cloudyhigh(value) {
        this._cloudyhigh = value;
        this.uniforms.get("cloudyhigh").value = value;
    }

    /**
     * 获取星空启用状态
     * @return {Boolean} 是否启用星空
     */
    get enableStars() {
        return this._enableStars;
    }

    /**
     * 设置星空启用状态
     * @param {Boolean} value - 是否启用星空
     */
    set enableStars(value) {
        this._enableStars = value;
        this.uniforms.get("enableStars").value = value ? 1 : 0;
    }

    /**
     * 获取星星密度阈值
     * @return {Number} 星星密度阈值
     */
    get starThreshold() {
        return this._starThreshold;
    }

    /**
     * 设置星星密度阈值
     * @param {Number} value - 星星密度阈值
     */
    set starThreshold(value) {
        this._starThreshold = value;
        this.uniforms.get("starThreshold").value = value;
    }

    /**
     * 获取天空深度阈值
     * @return {Number} 天空深度阈值
     */
    get skyMaskThreshold() {
        return this._skyMaskThreshold;
    }

    /**
     * 设置天空深度阈值
     * @param {Number} value - 天空深度阈值
     */
    set skyMaskThreshold(value) {
        this._skyMaskThreshold = value;
        this.uniforms.get("skyMaskThreshold").value = value;
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
     * 设置太阳位置
     * 使用高度角和方位角设置太阳位置
     * 
     * @param {Number} elevation - 高度角（度）
     * @param {Number} azimuth - 方位角（度）
     */
    setSunPosition(elevation, azimuth) {
        const phi = MathUtils.degToRad(90 - elevation);
        const theta = MathUtils.degToRad(azimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        this.sunPosition.set(x, y, z).normalize();
        this.uniforms.get("sunPosition").value.copy(this.sunPosition);
    }

    /**
     * 设置月亮位置
     * 使用高度角和方位角设置月亮位置
     * 
     * @param {Number} elevation - 高度角（度）
     * @param {Number} azimuth - 方位角（度）
     */
    setMoonPosition(elevation, azimuth) {
        const phi = MathUtils.degToRad(90 - elevation);
        const theta = MathUtils.degToRad(azimuth);

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        this.moonPosition.set(x, y, z).normalize();
        this.uniforms.get("moonPosition").value.copy(this.moonPosition);
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

        // 更新云层动画开关
        this.uniforms.get("animateClouds").value = this.animateClouds ? 1 : 0;

        // 更新参数
        this.uniforms.get("cloudy").value = this._cloudy;
        this.uniforms.get("height").value = this._height;
        this.uniforms.get("haze").value = this._haze;
        this.uniforms.get("cloudyhigh").value = this._cloudyhigh;
        this.uniforms.get("enableStars").value = this._enableStars ? 1 : 0;
        this.uniforms.get("starThreshold").value = this._starThreshold;
        this.uniforms.get("skyMaskThreshold").value = this._skyMaskThreshold;

        // 更新相机视图矩阵
        if (this._camera) {
            const viewMatrix = this.uniforms.get("viewMatrix").value;
            // 注意：我们使用相机的世界矩阵而不是视图矩阵
            // 这样可以确保天空效果正确跟随相机旋转
            viewMatrix.copy(this._camera.matrixWorld);

            // 如果相机FOV已更改，同步到着色器
            if (this._camera.fov !== this._fov) {
                this.fov = this._camera.fov;
            }
        }
    }
} 