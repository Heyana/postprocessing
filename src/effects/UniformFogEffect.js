import { Effect, EffectAttribute } from "postprocessing";
import { Color, Matrix4, Uniform, Vector2, Vector3 } from "three";
import fragmentShader from "./shaders/UniformFogEffect.glsl";

/**
 * 均匀雾效果
 * 
 * 提供一种距离无关的均匀雾效果，雾的浓度在视距范围内保持相对均匀
 */
export class UniformFogEffect extends Effect {

    /**
     * 构建一个新的均匀雾效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {Number} [options.fogDensity=0.5] - 雾气密度
     * @param {Color|String|Number} [options.fogColor=0xaaaaaa] - 雾气颜色
     * @param {Number} [options.fogMinDist=0.0] - 雾气最小距离
     * @param {Number} [options.quality=0.5] - 质量设置 (0-1)
     * @param {Number} [options.occludeSky=0.0] - 雾气遮挡天空的程度 (0-1)
     * @param {Number} [options.segments=3] - 雾的分段数，用于分段均匀雾
     * @param {Object} [options.camera] - 相机对象，用于获取视图矩阵和位置
     */
    constructor({
        fogDensity = 0.015,
        fogColor = 0xaaaaaa,
        fogMinDist = 100,
        quality = 0.5,
        occludeSky = 0.0,
        segments = 3,
        camera = null
    } = {}) {

        // 转换颜色参数
        const fogColorValue = new Color(fogColor);

        super("UniformFogEffect", fragmentShader, {
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["resolution", new Uniform(new Vector2())],
                ["time", new Uniform(0.0)],
                ["fogDensity", new Uniform(fogDensity)],
                ["fogColor", new Uniform(new Vector3(fogColorValue.r, fogColorValue.g, fogColorValue.b))],
                ["fogMinDist", new Uniform(fogMinDist)],
                ["quality", new Uniform(quality)],
                ["occludeSky", new Uniform(occludeSky)],
                ["segments", new Uniform(segments)],
                ["cameraPosition", new Uniform(new Vector3())],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["cameraFov", new Uniform(45.0)],
                ["fogSteps", new Uniform(64)],
                ["fogScale", new Uniform(0.03)],
                ["fogStrength", new Uniform(3.0)],
                ["fogEdgeMin", new Uniform(0.45)],
                ["fogEdgeMax", new Uniform(0.7)],
                ["fogAtten", new Uniform(0.009)],
                ["fogFadeWidth", new Uniform(2.0)]
            ])
        });

        this.camera = camera;
    }

    /**
     * 更新效果
     * 
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 自上一帧以来经过的时间（秒）
     */
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get("time").value += deltaTime;
        this.uniforms.get("resolution").value.set(
            inputBuffer.width, inputBuffer.height
        );

        // 如果有相机对象，更新相机相关的uniform
        if (this.camera) {
            this.uniforms.get("cameraPosition").value.copy(this.camera.position);
            this.uniforms.get("viewMatrix").value.copy(this.camera.matrixWorld);
            this.uniforms.get("cameraFov").value = this.camera.fov;
        }
    }

    /**
     * 相机对象
     */
    get camera() {
        return this._camera;
    }

    set camera(value) {
        this._camera = value;
        if (value) {
            this.uniforms.get("cameraPosition").value.copy(value.position);
            this.uniforms.get("viewMatrix").value.copy(value.matrixWorld);
            this.uniforms.get("cameraFov").value = value.fov;
        }
    }

    /**
     * 雾气密度
     */
    get fogDensity() {
        return this.uniforms.get("fogDensity").value;
    }

    set fogDensity(value) {
        this.uniforms.get("fogDensity").value = value;
    }

    /**
     * 雾气颜色
     */
    get fogColor() {
        const fogColorVector = this.uniforms.get("fogColor").value;
        return new Color(fogColorVector.x, fogColorVector.y, fogColorVector.z);
    }

    set fogColor(value) {
        const color = new Color(value);
        this.uniforms.get("fogColor").value.set(color.r, color.g, color.b);
    }

    /**
     * 雾气最小距离
     */
    get fogMinDist() {
        return this.uniforms.get("fogMinDist").value;
    }

    set fogMinDist(value) {
        this.uniforms.get("fogMinDist").value = value;
    }

    /**
     * 质量设置
     */
    get quality() {
        return this.uniforms.get("quality").value;
    }

    set quality(value) {
        this.uniforms.get("quality").value = value;
    }

    /**
     * 雾气遮挡天空的程度
     */
    get occludeSky() {
        return this.uniforms.get("occludeSky").value;
    }

    set occludeSky(value) {
        this.uniforms.get("occludeSky").value = value;
    }

    /**
     * 雾的分段数
     */
    get segments() {
        return this.uniforms.get("segments").value;
    }

    set segments(value) {
        this.uniforms.get("segments").value = value;
    }

    /**
     * 体积雾团采样步数
     */
    get fogSteps() { return this.uniforms.get("fogSteps").value; }
    set fogSteps(v) { this.uniforms.get("fogSteps").value = v; }

    /**
     * 雾团大小
     */
    get fogScale() { return this.uniforms.get("fogScale").value; }
    set fogScale(v) { this.uniforms.get("fogScale").value = v; }

    /**
     * 雾团强度
     */
    get fogStrength() { return this.uniforms.get("fogStrength").value; }
    set fogStrength(v) { this.uniforms.get("fogStrength").value = v; }

    /**
     * 雾团平滑起点
     */
    get fogEdgeMin() { return this.uniforms.get("fogEdgeMin").value; }
    set fogEdgeMin(v) { this.uniforms.get("fogEdgeMin").value = v; }

    /**
     * 雾团平滑终点
     */
    get fogEdgeMax() { return this.uniforms.get("fogEdgeMax").value; }
    set fogEdgeMax(v) { this.uniforms.get("fogEdgeMax").value = v; }

    /**
     * 雾的距离衰减系数
     */
    get fogAtten() { return this.uniforms.get("fogAtten").value; }
    set fogAtten(v) { this.uniforms.get("fogAtten").value = v; }

    /**
     * 雾的近距离淡入宽度
     */
    get fogFadeWidth() { return this.uniforms.get("fogFadeWidth").value; }
    set fogFadeWidth(v) { this.uniforms.get("fogFadeWidth").value = v; }
} 